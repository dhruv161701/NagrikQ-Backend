import { supabaseAdmin } from '../config/supabase';
import { generateEmbedding } from '../services/geminiService';

interface RetrievalConfig {
  similarityThreshold?: number;
  topK?: number;
  serviceIdFilter?: string;
}

/**
 * Generate embedding for a user question.
 */
export const generateQuestionEmbedding = async (question: string): Promise<number[]> => {
  if (!question || question.trim().length === 0) {
    throw new Error('Question is required for embedding generation');
  }
  return await generateEmbedding(question);
};

/**
 * Search Supabase pgvector for similar knowledge chunks.
 */
export const searchSimilarChunks = async (
  questionEmbedding: number[],
  config: RetrievalConfig = {}
): Promise<{
  chunks: Array<{
    id: string;
    service_id: string;
    service_name: string;
    topic: string;
    content: string;
    metadata: Record<string, unknown>;
    similarity: number;
  }>;
  hasResults: boolean;
}> => {
  const {
    similarityThreshold = 0.3,
    topK = 5,
    serviceIdFilter,
  } = config;

  let query = supabaseAdmin
    .from('knowledge_chunks')
    .select(
      'id, service_id, service_name, topic, content, metadata, embedding'
    )
    .not('embedding', 'is', null);

  // Filter by service_id if provided (service-specific questions)
  if (serviceIdFilter) {
    query = query.eq('service_id', serviceIdFilter);
  }

  // Order by similarity (distance) - use cosine distance
  // pgvector IVFFlat index with cosine distance
  const { data, error } = await query;

  if (error) {
    console.error('[ERR] Vector search error:', error);
    return { chunks: [], hasResults: false };
  }

  if (!data || data.length === 0) {
    return { chunks: [], hasResults: false };
  }

  // Calculate cosine similarity
  const queryVector = questionEmbedding as any;

  const chunksWithSimilarity = data.map((row: any) => {
    let storedEmbedding: number[] = [];
    if (Array.isArray(row.embedding)) {
      storedEmbedding = row.embedding;
    } else if (typeof row.embedding === 'string') {
      try {
        storedEmbedding = JSON.parse(row.embedding);
      } catch {
        storedEmbedding = row.embedding
          .replace(/[\[\]]/g, '')
          .split(',')
          .map((v: string) => parseFloat(v.trim()))
          .filter((v: number) => !isNaN(v));
      }
    }

    if (!storedEmbedding || storedEmbedding.length === 0) {
      return {
        id: row.id,
        service_id: row.service_id,
        service_name: row.service_name,
        topic: row.topic,
        content: row.content,
        metadata: row.metadata || {},
        similarity: 0,
      };
    }

    // Calculate cosine similarity
    const dotProduct = queryVector.reduce(
      (sum: number, qVal: number, i: number) =>
        sum + qVal * (storedEmbedding[i] || 0),
      0
    );

    const queryMagnitude = Math.sqrt(
      queryVector.reduce((sum: number, val: number) => sum + val * val, 0)
    );

    const storedMagnitude = Math.sqrt(
      storedEmbedding.reduce((sum: number, val: number) => sum + val * val, 0)
    );

    let similarity = 0;
    if (queryMagnitude > 0 && storedMagnitude > 0) {
      similarity = dotProduct / (queryMagnitude * storedMagnitude);
      // Clip to [-1, 1] range
      similarity = Math.max(-1, Math.min(1, similarity));
    }

    return {
      id: row.id,
      service_id: row.service_id,
      service_name: row.service_name,
      topic: row.topic,
      content: row.content,
      metadata: row.metadata || {},
      similarity,
    };
  });

  // Sort by similarity (descending)
  chunksWithSimilarity.sort((a, b) => b.similarity - a.similarity);

  // Apply similarity threshold and top-K filter
  const filteredChunks = chunksWithSimilarity
    .filter((chunk) => chunk.similarity >= similarityThreshold)
    .slice(0, topK);

  return {
    chunks: filteredChunks,
    hasResults: filteredChunks.length > 0,
  };
};

/**
 * Retrieve relevant knowledge chunks for a user question.
 * Applies service metadata filtering and similarity threshold.
 */
export const retrieveRelevantChunks = async (
  question: string,
  config: RetrievalConfig = {}
): Promise<{
  chunks: Array<{
    id: string;
    service_id: string;
    service_name: string;
    topic: string;
    content: string;
    metadata: Record<string, unknown>;
    similarity: number;
  }>;
  hasResults: boolean;
  answer: string;
  shouldAskGemini: boolean;
}> => {
  // 1. Validate question
  if (!question || question.trim().length === 0) {
    return {
      chunks: [],
      hasResults: false,
      answer: 'Please ask a question about government services.',
      shouldAskGemini: false,
    };
  }

  // 2. Generate Gemini embedding for the question
  let questionEmbedding: number[];
  try {
    questionEmbedding = await generateQuestionEmbedding(question);
  } catch (err) {
    console.error('[ERR] Failed to generate question embedding:', err);
    return {
      chunks: [],
      hasResults: false,
      answer: 'Unable to process your question at this time.',
      shouldAskGemini: false,
    };
  }

  // 3. Search Supabase pgvector for similar chunks
  const { chunks, hasResults } = await searchSimilarChunks(questionEmbedding, {
    similarityThreshold: config.similarityThreshold,
    topK: config.topK,
    serviceIdFilter: config.serviceIdFilter,
  });

  // 4. If no sufficiently relevant information, return safe response
  if (!hasResults || chunks.length === 0) {
    return {
      chunks: [],
      hasResults: false,
      answer: 'I do not have enough information about this requirement.',
      shouldAskGemini: false,
    };
  }

  // 5. Return retrieved chunks (Gemini will use these as context)
  return {
    chunks,
    hasResults: true,
    answer: '', // Will be generated by Gemini LLM
    shouldAskGemini: true,
  };
};