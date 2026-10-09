import { generateEmbedding } from '../services/geminiService';

interface ServiceKnowledge {
  serviceId: string;
  serviceName: string;
  state: string;
  department: string;
  documentType?: string;
  topic: string;
  content: string;
  metadata?: Record<string, unknown>;
}

interface ChunkResult {
  content: string;
  metadata: Record<string, unknown>;
}

/**
 * Chunk a service knowledge document into meaningful pieces.
 * Each chunk preserves enough context to be understandable by itself.
 */
export const chunkServiceKnowledge = (
  knowledge: ServiceKnowledge
): ChunkResult[] => {
  const chunks: ChunkResult[] = [];
  const { serviceId, serviceName, state, department, documentType, topic, content, metadata } = knowledge;

  const metadataBase: Record<string, unknown> = {
    service_id: serviceId,
    service_name: serviceName,
    state,
    department,
    ...(documentType && { document_type: documentType }),
    ...(metadata && metadata),
  };

  if (!content || content.trim().length === 0) {
    return chunks;
  }

  const lowerContent = content.toLowerCase();

  // 1. Eligibility chunk
  if (
    /eligible|eligibility|qualify|requirement.*elig/.test(lowerContent) ||
    /who.*apply|can apply|apply for/.test(lowerContent)
  ) {
    const eligibilityMatch = content.match(
      /eligible[^\.]*\.[^\.]*\./i
    ) || content.match(/who[^\.]*\.[^\.]*\./i);
    const eligibilityText = eligibilityMatch
      ? eligibilityMatch[0].trim()
      : content.substring(0, 200).trim();
    chunks.push({
      content: eligibilityText,
      metadata: { ...metadataBase, topic: 'eligibility' },
    });
  }

  // 2. Required documents chunk
  if (
    /required document|documents needed|what.*need|mandatory/.test(lowerContent) ||
    /must upload|must provide/.test(lowerContent)
  ) {
    const reqDocMatch = content.match(
      /required[^\.]*\.[^\.]*\./i
    ) || content.match(/must provide[^\.]*\.[^\.]*\./i);
    const reqDocText = reqDocMatch
      ? reqDocMatch[0].trim()
      : '';
    if (reqDocText) {
      chunks.push({
        content: reqDocText,
        metadata: { ...metadataBase, topic: 'required_documents' },
      });
    }
  }

  // 3. Aadhaar/PDF/image requirements chunk
  if (
    /aadhaar|pdf|image|format|upload.*format|can upload/.test(lowerContent)
  ) {
    const formatMatch = content.match(
      /aadhaar[^\.]*\.[^\.]*\.[^\.]*\./i
    ) || content.match(/pdf[^\.]*\.[^\.]*\./i) || content.match(/image[^\.]*\.[^\.]*\./i);
    const formatText = formatMatch
      ? formatMatch[0].trim()
      : '';
    if (formatText) {
      chunks.push({
        content: formatText,
        metadata: { ...metadataBase, topic: 'document_formats' },
      });
    }
  }

  // 4. Application process chunk
  if (
    /application process|how to apply|submit|steps|procedure/.test(lowerContent)
  ) {
    const processMatch = content.match(
      /application process[^\.]*\.[^\.]*\./i
    ) || content.match(/how to apply[^\.]*\.[^\.]*\./i) || content.match(/steps[^\.]*\.[^\.]*\./i);
    const processText = processMatch
      ? processMatch[0].trim()
      : '';
    if (processText) {
      chunks.push({
        content: processText,
        metadata: { ...metadataBase, topic: 'application_process' },
      });
    }
  }

  // 5. FAQ/chunks for common doubts
  const faqPatterns = [
    /why is this document required/gi,
    /what type of document/gi,
    /can i upload/gi,
    /instead of/gi,
  ];

  const hasFaqMatch = faqPatterns.some((pat) => pat.test(lowerContent));
  if (hasFaqMatch) {
    const faqMatches = content.match(/[^.]{20,}[.]/g) || [];
    const faqText = faqMatches
      .slice(0, 3)
      .map((m) => m.trim())
      .join(' | ');
    if (faqText.trim()) {
      chunks.push({
        content: faqText,
        metadata: { ...metadataBase, topic: 'faqs' },
      });
    }
  }

  // 6. If no specific chunk matched, create a general content chunk
  if (chunks.length === 0) {
    // Split content into semantic segments by sentences
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 10);

    // Create chunks of 2-3 sentences each
    for (let i = 0; i < sentences.length; i += 2) {
      const segment = sentences.slice(i, i + 3).join('. ') + '.';
      if (segment.trim().length > 0) {
        chunks.push({
          content: segment.trim(),
          metadata: { ...metadataBase, topic: 'general' },
        });
      }
    }
  }

  // Deduplicate chunks by content hash
  const seen = new Set<string>();
  const uniqueChunks: ChunkResult[] = [];
  for (const chunk of chunks) {
    const contentKey = chunk.content.toLowerCase().trim();
    if (!seen.has(contentKey)) {
      seen.add(contentKey);
      uniqueChunks.push(chunk);
    }
  }

  return uniqueChunks.length > 0 ? uniqueChunks : [{ content: content.substring(0, 500).trim(), metadata: metadataBase }];
};

/**
 * Generate embeddings for an array of text chunks.
 * Process in batches for efficiency.
 */
export const generateChunksEmbeddings = async (
  chunks: Array<{ content: string; metadata: Record<string, unknown> }>
): Promise<Array<{ content: string; metadata: Record<string, unknown>; embedding: number[] }>> => {
  const results: Array<{
    content: string;
    metadata: Record<string, unknown>;
    embedding: number[];
  }> = [];

  for (const chunk of chunks) {
    try {
      const embedding = await generateEmbedding(chunk.content);
      results.push({
        content: chunk.content,
        metadata: chunk.metadata,
        embedding,
      });
    } catch (err) {
      console.error('[ERR] Failed to generate embedding for chunk:', err);
      results.push({
        content: chunk.content,
        metadata: chunk.metadata,
        embedding: [],
      });
    }
  }

  return results;
};

/**
 * Ingest service knowledge into the RAG knowledge base.
 * Chunks the content, generates embeddings, and stores in Supabase.
 */
export const ingestServiceKnowledge = async (
  supabase: any,
  knowledge: ServiceKnowledge[]
) => {
  for (const kw of knowledge) {
    const chunks = chunkServiceKnowledge(kw);

    for (const chunk of chunks) {
      const embedding = await generateEmbedding(chunk.content);

      const { error } = await supabase
        .from('knowledge_chunks')
        .upsert({
          service_id: kw.serviceId,
          service_name: kw.serviceName,
          state: kw.state,
          department: kw.department || '',
          document_type: kw.documentType || '',
          topic: chunk.metadata.topic,
          content: chunk.content,
          embedding: embedding as any,
          metadata: chunk.metadata,
          updated_at: new Date().toISOString(),
        })
        .select();

      if (error) {
        console.error('[ERR] Failed to upsert knowledge chunk:', error);
      }
    }
  }
};