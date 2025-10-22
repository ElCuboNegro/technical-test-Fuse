/**
 * Redis-based event queue implementation with backpressure control and fallback buffering
 * Uses Redis Lists for persistent, ordered event queuing with LPUSH/RPOP operations
 * Requirements: 2.2, 2.5, 5.3
 */

import { createClient, RedisClientType } from 'redis';
import { RedisEventQueue, RedisQueueStats } from '../interfaces/redis-event-queue';
import { EventEnvelope, EventType } from '../interfaces/event-envelope';

/**
 * Configuration options for RedisEventQueue
 */
export interface RedisEventQueueConfig {
  /** Redis connection URL */
  redisUrl?: string;
  
  /** Maximum queue length before backpressure activates */
  maxQueueLength?: number;
  
  /** Backpressure threshold as percentage (0-1) */
  backpressureThreshold?: number;
  
  /** Maximum fallback buffer size when Redis is unavailable */
  fallbackBufferSize?: number;
  
  /** Redis queue key name */
  queueKey?: string;
  
  /** Connection retry attempts */
  maxRetries?: number;
  
  /** Retry delay in milliseconds */
  retryDelay?: number;
}

/**
 * Redis-based event queue implementation with persistent storage and backpressure control
 */
export class RedisEventQueueImpl implements RedisEventQueue {
  private redis: RedisClientType;
  private fallbackBuffer: EventEnvelope[] = [];
  private config: Required<RedisEventQueueConfig>;
  private stats = {
    totalEnqueued: 0,
    totalDequeued: 0,
    droppedEvents: 0,
    operationErrors: 0,
    reconnectAttempts: 0
  };
  private isConnected = false;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(config: RedisEventQueueConfig = {}) {
    this.config = {
      redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      maxQueueLength: config.maxQueueLength || 1000,
      backpressureThreshold: config.backpressureThreshold || 0.8,
      fallbackBufferSize: config.fallbackBufferSize || 100,
      queueKey: config.queueKey || 'conversation_events_queue',
      maxRetries: config.maxRetries || 5,
      retryDelay: config.retryDelay || 1000
    };

    this.redis = createClient({
      url: this.config.redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries >= this.config.maxRetries) {
            return false; // Stop reconnecting
          }
          return Math.min(retries * this.config.retryDelay, 30000);
        }
      }
    });

    this.setupEventHandlers();
    this.connect();
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      console.log('Redis client connected');
      this.isConnected = true;
    });

    this.redis.on('ready', async () => {
      console.log('Redis client ready');
      this.isConnected = true;
      await this.flushFallbackBuffer();
    });

    this.redis.on('error', (error) => {
      console.error('Redis client error:', error);
      this.stats.operationErrors++;
      this.isConnected = false;
    });

    this.redis.on('end', () => {
      console.log('Redis client disconnected');
      this.isConnected = false;
    });

    this.redis.on('reconnecting', () => {
      console.log('Redis client reconnecting');
      this.stats.reconnectAttempts++;
    });
  }

  private async connect(): Promise<void> {
    try {
      await this.redis.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      this.isConnected = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(async () => {
      if (!this.isConnected) {
        await this.connect();
      }
    }, this.config.retryDelay);
  }

  private async flushFallbackBuffer(): Promise<void> {
    if (!this.isConnected || this.fallbackBuffer.length === 0) {
      return;
    }

    try {
      // Transfer events from fallback buffer to Redis in order
      while (this.fallbackBuffer.length > 0) {
        const event = this.fallbackBuffer.shift();
        if (event) {
          await this.redis.lPush(this.config.queueKey, JSON.stringify(event));
        }
      }
      console.log('Fallback buffer flushed to Redis');
    } catch (error) {
      console.error('Failed to flush fallback buffer:', error);
      this.stats.operationErrors++;
    }
  }

  async enqueue(event: EventEnvelope): Promise<void> {
    try {
      if (!this.isConnected) {
        return this.enqueueToFallbackBuffer(event);
      }

      // Check backpressure before enqueuing
      if (await this.applyBackpressure()) {
        if (!this.isAuditEvent(event)) {
          // Drop non-audit events during backpressure
          this.stats.droppedEvents++;
          return;
        }
      }

      await this.redis.lPush(this.config.queueKey, JSON.stringify(event));
      this.stats.totalEnqueued++;
    } catch (error) {
      this.stats.operationErrors++;
      this.isConnected = false;
      
      // Fallback to buffer on Redis error
      await this.enqueueToFallbackBuffer(event);
      this.scheduleReconnect();
    }
  }

  private async enqueueToFallbackBuffer(event: EventEnvelope): Promise<void> {
    if (this.fallbackBuffer.length >= this.config.fallbackBufferSize) {
      if (this.isAuditEvent(event)) {
        // Preserve audit events by dropping oldest non-audit event
        const nonAuditIndex = this.fallbackBuffer.findIndex(e => !this.isAuditEvent(e));
        if (nonAuditIndex >= 0) {
          this.fallbackBuffer.splice(nonAuditIndex, 1);
          this.stats.droppedEvents++;
        } else {
          // All events in buffer are audit events, drop oldest
          this.fallbackBuffer.shift();
          this.stats.droppedEvents++;
        }
      } else {
        // Drop non-audit event
        this.stats.droppedEvents++;
        return;
      }
    }

    this.fallbackBuffer.push(event);
    this.stats.totalEnqueued++;
  }

  async dequeue(): Promise<EventEnvelope | null> {
    try {
      if (!this.isConnected) {
        // Use fallback buffer when Redis is disconnected
        const event = this.fallbackBuffer.shift() || null;
        if (event) {
          this.stats.totalDequeued++;
        }
        return event;
      }

      const result = await this.redis.rPop(this.config.queueKey);
      if (result) {
        this.stats.totalDequeued++;
        const parsed = JSON.parse(result);
        // Convert timestamp string back to Date object
        if (parsed.timestamp) {
          parsed.timestamp = new Date(parsed.timestamp);
        }
        return parsed;
      }
      return null;
    } catch (error) {
      this.stats.operationErrors++;
      this.isConnected = false;
      this.scheduleReconnect();
      
      // Fallback to buffer on Redis error
      const event = this.fallbackBuffer.shift() || null;
      if (event) {
        this.stats.totalDequeued++;
      }
      return event;
    }
  }

  async getQueueLength(): Promise<number> {
    try {
      if (!this.isConnected) {
        return this.fallbackBuffer.length;
      }
      return await this.redis.lLen(this.config.queueKey);
    } catch (error) {
      this.stats.operationErrors++;
      this.isConnected = false;
      this.scheduleReconnect();
      return this.fallbackBuffer.length;
    }
  }

  async applyBackpressure(): Promise<boolean> {
    const queueLength = await this.getQueueLength();
    return queueLength >= (this.config.maxQueueLength * this.config.backpressureThreshold);
  }

  async flush(): Promise<EventEnvelope[]> {
    try {
      if (!this.isConnected) {
        const events = [...this.fallbackBuffer];
        this.fallbackBuffer = [];
        return events;
      }

      const events = await this.redis.lRange(this.config.queueKey, 0, -1);
      await this.redis.del(this.config.queueKey);
      
      return events.map((e: string) => {
        const parsed = JSON.parse(e);
        // Convert timestamp string back to Date object
        if (parsed.timestamp) {
          parsed.timestamp = new Date(parsed.timestamp);
        }
        return parsed;
      }).reverse(); // Reverse to maintain chronological order (LPUSH stores in reverse)
    } catch (error) {
      this.stats.operationErrors++;
      this.isConnected = false;
      this.scheduleReconnect();
      
      // Fallback to buffer on Redis error
      const events = [...this.fallbackBuffer];
      this.fallbackBuffer = [];
      return events;
    }
  }

  async getStats(): Promise<RedisQueueStats> {
    const queueLength = await this.getQueueLength();
    return {
      currentQueueLength: queueLength,
      maxQueueLength: this.config.maxQueueLength,
      utilizationPercent: Math.round((queueLength / this.config.maxQueueLength) * 100),
      totalEnqueued: this.stats.totalEnqueued,
      totalDequeued: this.stats.totalDequeued,
      droppedEvents: this.stats.droppedEvents,
      backpressureActive: await this.applyBackpressure(),
      connectionStatus: this.isConnected ? 'connected' : 'disconnected',
      operationErrors: this.stats.operationErrors
    };
  }

  async clear(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.redis.del(this.config.queueKey);
      }
      this.fallbackBuffer = [];
    } catch (error) {
      this.stats.operationErrors++;
      this.fallbackBuffer = [];
    }
  }

  async isEmpty(): Promise<boolean> {
    return (await this.getQueueLength()) === 0;
  }

  setBackpressureThreshold(maxLength: number): void {
    this.config.maxQueueLength = maxLength;
  }

  async handleConnectionFailure(): Promise<void> {
    this.isConnected = false;
    this.stats.reconnectAttempts++;
    this.scheduleReconnect();
  }

  async restoreConnection(): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }
    
    if (this.isConnected) {
      await this.flushFallbackBuffer();
    }
  }

  async getConnectionHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'failed';
    lastError?: string;
    reconnectAttempts: number;
  }> {
    try {
      if (this.isConnected) {
        await this.redis.ping();
        return {
          status: 'healthy',
          reconnectAttempts: this.stats.reconnectAttempts
        };
      } else {
        return {
          status: 'failed',
          lastError: 'Redis connection lost',
          reconnectAttempts: this.stats.reconnectAttempts
        };
      }
    } catch (error) {
      return {
        status: 'failed',
        lastError: error instanceof Error ? error.message : 'Unknown error',
        reconnectAttempts: this.stats.reconnectAttempts
      };
    }
  }

  /**
   * Determine if an event is critical and should be preserved during backpressure
   */
  private isAuditEvent(event: EventEnvelope): boolean {
    // Audit events are critical events that should be preserved
    return event.event_type === EventType.ERROR || 
           event.event_type === EventType.TERMINATION ||
           event.event_type === EventType.SESSION_STARTED ||
           event.payload.audit === true;
  }

  /**
   * Gracefully close the Redis connection
   */
  async close(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.isConnected) {
      await this.redis.quit();
    }
  }
}