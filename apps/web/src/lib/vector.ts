/**
 * Vector Database Utilities using pgvector (Web App)
 * 
 * This module provides utilities for working with vector embeddings in PostgreSQL
 * using the pgvector extension for similarity search and retrieval.
 */

import { Pool } from 'pg';
import { database } from './database';

// Types for vector operations
export interface VectorDocument {
  id?: string;
  content: string;
  metadata?: Record<string, any>;
  embedding?: number[];
  similarity?: number;
}

export interface VectorMemory {
  id?: string;
  sessionId: string;
  memoryType: string;
  memoryKey?: string;
  content: Record<string, any>;
  contentText: string;
  embedding?: number[];
  importanceScore?: number;
  similarity?: number;
}

export interface SimilaritySearchOptions {
  limit?: number;
  threshold?: number;
  filter?: Record<string, any>;
}

/**
 * Vector Database Service for pgvector operations
 */
export class VectorService {
  private async getPool(): Promise<Pool> {
    await database.connect();
    const pool = database.getPool();
    if (!pool) {
      throw new Error('Failed to connect to database');
    }
    return pool;
  }

  /**
   * Store a document with its embedding
   */
  async storeDocument(document: VectorDocument): Promise<string> {
    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO documents (document_id, title, content, metadata, embedding, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        ON CONFLICT (document_id) 
        DO UPDATE SET 
          content = EXCLUDED.content,
          metadata = EXCLUDED.metadata,
          embedding = EXCLUDED.embedding,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `;

      const documentId = document.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const title = document.metadata?.title || documentId;
      
      const result = await client.query(query, [
        documentId,
        title,
        document.content,
        JSON.stringify(document.metadata || {}),
        document.embedding ? `[${document.embedding.join(',')}]` : null
      ]);

      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  /**
   * Store agent memory with embedding
   */
  async storeMemory(memory: VectorMemory): Promise<string> {
    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO agent_memory (
          session_id, memory_type, memory_key, content, content_text, 
          embedding, importance_score, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        RETURNING id
      `;

      const result = await client.query(query, [
        memory.sessionId,
        memory.memoryType,
        memory.memoryKey,
        JSON.stringify(memory.content),
        memory.contentText,
        memory.embedding ? `[${memory.embedding.join(',')}]` : null,
        memory.importanceScore || 0.0
      ]);

      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  /**
   * Perform similarity search on documents
   */
  async searchDocuments(
    queryEmbedding: number[],
    options: SimilaritySearchOptions = {}
  ): Promise<VectorDocument[]> {
    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      const { limit = 10, threshold = 0.7 } = options;
      
      const query = `
        SELECT 
          document_id as id,
          title,
          content,
          metadata,
          embedding,
          1 - (embedding <=> $1) as similarity
        FROM documents
        WHERE embedding IS NOT NULL
          AND 1 - (embedding <=> $1) > $2
        ORDER BY embedding <=> $1
        LIMIT $3
      `;

      const result = await client.query(query, [
        `[${queryEmbedding.join(',')}]`,
        threshold,
        limit
      ]);

      return result.rows.map(row => ({
        id: row.id,
        content: row.content,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        embedding: row.embedding,
        similarity: parseFloat(row.similarity)
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Perform similarity search on agent memory
   */
  async searchMemory(
    sessionId: string,
    queryEmbedding: number[],
    options: SimilaritySearchOptions = {}
  ): Promise<VectorMemory[]> {
    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      const { limit = 10, threshold = 0.7 } = options;
      
      const query = `
        SELECT 
          id,
          session_id as "sessionId",
          memory_type as "memoryType",
          memory_key as "memoryKey",
          content,
          content_text as "contentText",
          embedding,
          importance_score as "importanceScore",
          1 - (embedding <=> $1) as similarity
        FROM agent_memory
        WHERE session_id = $2
          AND embedding IS NOT NULL
          AND 1 - (embedding <=> $1) > $3
        ORDER BY embedding <=> $1
        LIMIT $4
      `;

      const result = await client.query(query, [
        `[${queryEmbedding.join(',')}]`,
        sessionId,
        threshold,
        limit
      ]);

      return result.rows.map(row => ({
        id: row.id,
        sessionId: row.sessionId,
        memoryType: row.memoryType,
        memoryKey: row.memoryKey,
        content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
        contentText: row.contentText,
        embedding: row.embedding,
        importanceScore: parseFloat(row.importanceScore || '0'),
        similarity: parseFloat(row.similarity)
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Get document by ID
   */
  async getDocument(documentId: string): Promise<VectorDocument | null> {
    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      const query = `
        SELECT document_id as id, title, content, metadata, embedding
        FROM documents
        WHERE document_id = $1
      `;

      const result = await client.query(query, [documentId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        content: row.content,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        embedding: row.embedding
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get vector database statistics
   */
  async getStats(): Promise<{
    documentCount: number;
    memoryCount: number;
    documentsWithEmbeddings: number;
    memoriesWithEmbeddings: number;
  }> {
    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          (SELECT COUNT(*) FROM documents) as document_count,
          (SELECT COUNT(*) FROM agent_memory) as memory_count,
          (SELECT COUNT(*) FROM documents WHERE embedding IS NOT NULL) as documents_with_embeddings,
          (SELECT COUNT(*) FROM agent_memory WHERE embedding IS NOT NULL) as memories_with_embeddings
      `;

      const result = await client.query(query);
      const row = result.rows[0];

      return {
        documentCount: parseInt(row.document_count),
        memoryCount: parseInt(row.memory_count),
        documentsWithEmbeddings: parseInt(row.documents_with_embeddings),
        memoriesWithEmbeddings: parseInt(row.memories_with_embeddings)
      };
    } finally {
      client.release();
    }
  }

  /**
   * Test vector database connection and functionality
   */
  async healthCheck(): Promise<{ status: string; message: string; details?: any }> {
    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      // Test basic connection
      await client.query('SELECT 1');

      // Test pgvector extension
      const extensionResult = await client.query(
        "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')"
      );
      
      if (!extensionResult.rows[0].exists) {
        return {
          status: 'error',
          message: 'pgvector extension is not installed'
        };
      }

      // Test vector operations
      const testResult = await client.query(
        "SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector as distance"
      );

      const stats = await this.getStats();

      return {
        status: 'healthy',
        message: 'Vector database is operational',
        details: {
          pgvectorInstalled: true,
          testDistance: parseFloat(testResult.rows[0].distance),
          ...stats
        }
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Vector database health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    } finally {
      client.release();
    }
  }
}

// Export singleton instance
export const vectorService = new VectorService();