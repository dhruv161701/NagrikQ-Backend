import { GoogleGenerativeAI } from '@google/generative-ai';

export const getApiKey = (): string => {
  return process.env.GEMINI_API_KEY || '';
};

export const getApiKeyDiagnostic = (): { isValidKeyFormat: boolean; credentialType: string; message: string } => {
  const key = getApiKey();
  if (!key) {
    return {
      isValidKeyFormat: false,
      credentialType: 'NONE',
      message: 'GEMINI_API_KEY is not configured in backend environment.',
    };
  }
  if (key.startsWith('AQ.') || key.startsWith('ya29.')) {
    return {
      isValidKeyFormat: false,
      credentialType: 'OAUTH_ACCESS_TOKEN',
      message: 'Configured GEMINI_API_KEY is an OAuth access token, which Google Generative Language API rejects with ACCESS_TOKEN_TYPE_UNSUPPORTED. Replace with a standard Gemini API key from Google AI Studio starting with "AIzaSy".',
    };
  }
  if (!key.startsWith('AIza')) {
    return {
      isValidKeyFormat: false,
      credentialType: 'NON_STANDARD_FORMAT',
      message: 'Configured GEMINI_API_KEY does not match standard Gemini API Key format (starting with "AIza").',
    };
  }
  return {
    isValidKeyFormat: true,
    credentialType: 'API_KEY',
    message: 'Valid Gemini API Key format configured.',
  };
};

const getGenAI = (): GoogleGenerativeAI => {
  const key = getApiKey();
  return new GoogleGenerativeAI(key);
};

const CANDIDATE_CHAT_MODELS = [
  'gemini-1.5-flash',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-1.5-pro',
];

export const geminiChatModel = {
  generateContent: async (prompt: string) => {
    const diag = getApiKeyDiagnostic();
    if (!diag.isValidKeyFormat) {
      console.warn(`[GEMINI_AUTH_WARN] ${diag.message}`);
      throw new Error(`GEMINI_AUTH_ERROR: ${diag.message}`);
    }

    const genAI = getGenAI();
    let lastErr: any = null;
    for (const mName of CANDIDATE_CHAT_MODELS) {
      try {
        const model = genAI.getGenerativeModel({ model: mName });
        return await model.generateContent(prompt);
      } catch (err: any) {
        lastErr = err;
        if (err?.status === 401 || err?.message?.includes('API key not valid') || err?.message?.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED')) {
          console.error('[GEMINI_AUTH_ERROR] Authentication failed. Invalid API Key.');
          throw new Error('GEMINI_AUTH_ERROR: Invalid API key credentials.');
        }
      }
    }
    throw lastErr || new Error('All candidate Gemini models failed.');
  },
};

export const geminiEmbeddingModel = {
  embedContent: async (content: any) => {
    const diag = getApiKeyDiagnostic();
    if (!diag.isValidKeyFormat) {
      return { embedding: { values: [] } };
    }

    const genAI = getGenAI();
    const candidateEmbeddingModels = ['text-embedding-004', 'embedding-001'];
    const payload =
      typeof content === 'string'
        ? { content: { parts: [{ text: content }] } }
        : content;

    for (const emName of candidateEmbeddingModels) {
      try {
        const model = genAI.getGenerativeModel({ model: emName });
        return await model.embedContent(payload as any);
      } catch (err: any) {
        if (err?.status === 401 || err?.message?.includes('API key not valid')) {
          throw err;
        }
      }
    }
    return { embedding: { values: [] } };
  },
};

export const generateEmbedding = async (text: string): Promise<number[]> => {
  const diag = getApiKeyDiagnostic();
  if (!diag.isValidKeyFormat) {
    return [];
  }

  try {
    const result = await geminiEmbeddingModel.embedContent(text);
    const embedding = result?.embedding;
    if (!embedding || !embedding.values) {
      return [];
    }
    return embedding.values;
  } catch (err: any) {
    if (err?.message?.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') || err?.status === 401) {
      console.warn('[GEMINI_EMBEDDING_AUTH_NOTICE] Gemini embedding skipped due to incompatible OAuth credential.');
    } else {
      console.warn('[ERR] Failed to generate embedding from Gemini:', err?.message || err);
    }
    return [];
  }
};

export const generateAnswer = async (
  question: string,
  contextChunks: Array<{
    content: string;
    service_name: string;
    topic: string;
    service_id: string;
    document_type?: string;
    metadata?: Record<string, unknown>;
  }>
): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return 'The AI assistant is temporarily unavailable because the API key is not configured.';
  }

  const systemInstruction = `
You are NagrikQ's government service assistant.

Answer ONLY using the provided NagrikQ context below.

Do not invent or assume government requirements.

If the context does not contain the answer, clearly state that the information is unavailable.

Give simple, clear answers suitable for citizens.

When listing documents, clearly distinguish required, optional, and conditional documents.

Answer in the user's language when possible.

---

Context:
`;

  const contextText = contextChunks
    .map((chunk) => {
      const serviceInfo = chunk.service_name ? `Service: ${chunk.service_name}` : '';
      const topicInfo = chunk.topic ? `Topic: ${chunk.topic}` : '';
      const docTypeInfo = chunk.document_type ? `Document Type: ${chunk.document_type}` : '';
      return `[${serviceInfo} | ${topicInfo} | ${docTypeInfo}] ${chunk.content}`;
    })
    .join('\n\n');

  const fullPrompt = `${systemInstruction}${contextText}\n\nQuestion: ${question}\n\nAnswer:`;

  const genAI = getGenAI();

  try {
    let result;
    for (const mName of CANDIDATE_CHAT_MODELS) {
      try {
        result = await genAI.getGenerativeModel({ model: mName }).generateContent(fullPrompt);
        if (result) break;
      } catch {
        // try next candidate model
      }
    }

    if (!result) {
      return 'I do not have enough information about this requirement.';
    }

    const response = await result.response;
    const text = response.text();

    if (!text || text.trim().length === 0) {
      return 'I do not have enough information about this requirement.';
    }

    return text;
  } catch (err: any) {
    console.error('[ERR] Gemini generateContent failed:', err?.message || err);
    return 'I encountered an issue generating an answer right now. Please try again.';
  }
};