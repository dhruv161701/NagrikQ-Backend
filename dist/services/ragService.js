"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retrieveRelevantChunks = exports.searchSimilarChunks = exports.generateQuestionEmbedding = void 0;
const supabase_1 = require("../config/supabase");
const geminiService_1 = require("../services/geminiService");
/**
 * Generate embedding for a user question.
 */
const generateQuestionEmbedding = async (question) => {
    if (!question || question.trim().length === 0) {
        throw new Error('Question is required for embedding generation');
    }
    return await (0, geminiService_1.generateEmbedding)(question);
};
exports.generateQuestionEmbedding = generateQuestionEmbedding;
/**
 * Search Supabase pgvector for similar knowledge chunks.
 */
const searchSimilarChunks = async (questionEmbedding, config = {}) => {
    const { similarityThreshold = 0.3, topK = 5, serviceIdFilter, } = config;
    let query = supabase_1.supabaseAdmin
        .from('knowledge_chunks')
        .select('id, service_id, service_name, topic, content, metadata, embedding')
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
    const queryVector = questionEmbedding;
    const chunksWithSimilarity = data.map((row) => {
        let storedEmbedding = [];
        if (Array.isArray(row.embedding)) {
            storedEmbedding = row.embedding;
        }
        else if (typeof row.embedding === 'string') {
            try {
                storedEmbedding = JSON.parse(row.embedding);
            }
            catch {
                storedEmbedding = row.embedding
                    .replace(/[\[\]]/g, '')
                    .split(',')
                    .map((v) => parseFloat(v.trim()))
                    .filter((v) => !isNaN(v));
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
        const dotProduct = queryVector.reduce((sum, qVal, i) => sum + qVal * (storedEmbedding[i] || 0), 0);
        const queryMagnitude = Math.sqrt(queryVector.reduce((sum, val) => sum + val * val, 0));
        const storedMagnitude = Math.sqrt(storedEmbedding.reduce((sum, val) => sum + val * val, 0));
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
exports.searchSimilarChunks = searchSimilarChunks;
/**
 * Retrieve relevant knowledge chunks for a user question.
 * Applies service metadata filtering and similarity threshold.
 */
const retrieveRelevantChunks = async (question, config = {}) => {
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
    let questionEmbedding;
    try {
        questionEmbedding = await (0, exports.generateQuestionEmbedding)(question);
    }
    catch (err) {
        console.error('[ERR] Failed to generate question embedding:', err);
        return {
            chunks: [],
            hasResults: false,
            answer: 'Unable to process your question at this time.',
            shouldAskGemini: false,
        };
    }
    // 3. Search Supabase pgvector for similar chunks
    const { chunks, hasResults } = await (0, exports.searchSimilarChunks)(questionEmbedding, {
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
exports.retrieveRelevantChunks = retrieveRelevantChunks;
