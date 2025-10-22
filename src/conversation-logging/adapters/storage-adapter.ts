import { Pool, PoolConfig } from 'pg';
import { StorageAdapter as IStorageAdapter, StorageResult, BatchStorageResult, QueryResult } from '../interfaces/storage-adapter';
import { EventEnvelope } from '../interfaces/event-envelope';

export interface StorageAdapterConfig {
  connectionString: string;
  maxConnections?: number;
  connectionTimeoutMs?: number;
  queryTimeoutMs?: number;
}

export class StorageAdapter implements IStorageAdapter {
  private pool: Pool;
  private config: StorageAdapterConfig;

  constructor(config: StorageAdapterConfig) {
    this.config = config;
    
    const poolConfig: PoolConfig = {
      connectionString: config.connectionString,
      max: config.maxConnections || 10,
      connectionTimeoutMillis: config.connectionTimeoutMs || 5000,
      query_timeout: config.queryTimeoutMs || 10000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };

    this.pool = new Pool(poolConfig);
  }

  async storeEvent(event: EventEnvelope): Promise<StorageResult> {
    try {
      const query = `
        INSERT INTO conversation_events (
          id, session_id, user_id, timestamp, event_type, 
          node_id, payload, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING id
      `;

      const values = [
        event.id,
        event.sessionId,
        event.userId,
        event.timestamp,
        event.eventType,
        event.nodeId,
        JSON.stringify(event.payload),
        JSON.stringify(event.metadata)
      ];

      const result = await this.pool.query(query, values);
      
      return {
        success: true,
        eventId: result.rows[0].id
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown storage error'
      };
    }
  }

  async storeBatch(events: EventEnvelope[]): Promise<BatchStorageResult> {
    if (events.length === 0) {
      return {
        success: true,
        storedCount: 0
      };
    }

    try {
      await this.pool.query('BEGIN');

      const storedIds: string[] = [];
      
      for (const event of events) {
        const query = `
          INSERT INTO conversation_events (
            id, session_id, user_id, timestamp, event_type, 
            node_id, payload, metadata, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          RETURNING id
        `;

        const values = [
          event.id,
          event.sessionId,
          event.userId,
          event.timestamp,
          event.eventType,
          event.nodeId,
          JSON.stringify(event.payload),
          JSON.stringify(event.metadata)
        ];

        const result = await this.pool.query(query, values);
        storedIds.push(result.rows[0].id);
      }

      await this.pool.query('COMMIT');

      return {
        success: true,
        storedCount: storedIds.length,
        eventIds: storedIds
      };
    } catch (error) {
      await this.pool.query('ROLLBACK');
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown batch storage error',
        storedCount: 0
      };
    }
  }

  async getEvents(sessionId: string, limit?: number, offset?: number): Promise<QueryResult> {
    try {
      let query = `
        SELECT * FROM conversation_events 
        WHERE session_id = $1 
        ORDER BY timestamp ASC
      `;
      
      const params: any[] = [sessionId];
      
      if (limit) {
        query += ` LIMIT $${params.length + 1}`;
        params.push(limit);
      }
      
      if (offset) {
        query += ` OFFSET $${params.length + 1}`;
        params.push(offset);
      }

      const result = await this.pool.query(query, params);
      
      const events: EventEnvelope[] = result.rows.map(row => ({
        id: row.id,
        sessionId: row.session_id,
        userId: row.user_id,
        timestamp: row.timestamp,
        eventType: row.event_type,
        nodeId: row.node_id,
        payload: row.payload,
        metadata: row.metadata
      }));

      return {
        success: true,
        events
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown query error'
      };
    }
  }

  async getEventsByTimeRange(
    sessionId: string, 
    startTime: Date, 
    endTime: Date
  ): Promise<QueryResult> {
    try {
      const query = `
        SELECT * FROM conversation_events 
        WHERE session_id = $1 
        AND timestamp >= $2 
        AND timestamp <= $3
        ORDER BY timestamp ASC
      `;

      const result = await this.pool.query(query, [sessionId, startTime, endTime]);
      
      const events: EventEnvelope[] = result.rows.map(row => ({
        id: row.id,
        sessionId: row.session_id,
        userId: row.user_id,
        timestamp: row.timestamp,
        eventType: row.event_type,
        nodeId: row.node_id,
        payload: row.payload,
        metadata: row.metadata
      }));

      return {
        success: true,
        events
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown query error'
      };
    }
  }

  async deleteEventsBySession(sessionId: string): Promise<StorageResult> {
    try {
      const query = 'DELETE FROM conversation_events WHERE session_id = $1';
      const result = await this.pool.query(query, [sessionId]);
      
      return {
        success: true,
        eventId: `Deleted ${result.rowCount} events`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown deletion error'
      };
    }
  }

  async cleanup(): Promise<void> {
    await this.pool.end();
  }

  // Health check method for monitoring
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      await this.pool.query('SELECT 1');
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown health check error'
      };
    }
  }
}