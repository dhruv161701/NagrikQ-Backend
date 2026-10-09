import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { generateEmbedding } from '../services/geminiService';
import { retrieveRelevantChunks } from '../services/ragService';
import { generateAnswer } from '../services/geminiService';
import { ApiResponse } from '../types';

export const askRagQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { question, service_id } = req.body;

    // 1. Validate question
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Question is required.' },
      } as ApiResponse);
      return;
    }

    // 2. Generate Gemini embedding for the question
    let questionEmbedding: number[];
    try {
      questionEmbedding = await generateEmbedding(question.trim());
    } catch (err) {
      console.error('[ERR] Gemini embedding generation failed:', err);
      res.status(500).json({
        success: false,
        error: { code: 'EMBEDDING_ERROR', message: 'Failed to generate question embedding.' },
      } as ApiResponse);
      return;
    }

    // 3. Search Supabase pgvector for similar knowledge chunks
    const retrievalConfig: any = {
      similarityThreshold: 0.3,
      topK: 5,
    };

    if (service_id) {
      retrievalConfig.serviceIdFilter = service_id;
    }

    const { chunks, hasResults } = await retrieveRelevantChunks(question.trim(), retrievalConfig);

    // 4. If no sufficiently relevant information, return safe response
    if (!hasResults || chunks.length === 0) {
      res.json({
        success: true,
        data: {
          answer: 'I do not have enough information about this requirement.',
          sources: [],
        },
      } as ApiResponse);
      return;
    }

    // 5. Generate answer using Gemini LLM with retrieved context
    try {
      const answer = await generateAnswer(question.trim(), chunks.map((chunk) => ({
        content: chunk.content,
        service_name: chunk.service_name,
        topic: chunk.topic,
        service_id: chunk.service_id,
        metadata: chunk.metadata,
      })));

      // 6. Format sources for response
      const sources = chunks.map((chunk) => ({
        service_id: chunk.service_id,
        service_name: chunk.service_name,
        topic: chunk.topic,
        content: chunk.content,
      }));

      res.json({
        success: true,
        data: {
          answer,
          sources,
        },
      } as ApiResponse);
    } catch (err) {
      console.error('[ERR] Gemini LLM answer generation failed:', err);
      res.status(500).json({
        success: false,
        error: { code: 'LLM_ERROR', message: 'Failed to generate answer.' },
      } as ApiResponse);
      return;
    }
  } catch (err: any) {
    console.error('[ERR] RAG endpoint error:', err);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message || 'An unexpected error occurred.' },
    } as ApiResponse);
  }
};