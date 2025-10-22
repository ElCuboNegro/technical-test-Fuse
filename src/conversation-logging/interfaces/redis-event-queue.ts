/**
 * Redis-based event queue interface for persistent queuing with backpressure control
 * Replaces in-memory ring buffer with Redis Lists for better reliability and persistence
 * Requirements: 2.2, 2.5, 5.3
 */

import { EventEnvelope } from './event-envelope';

/**
 * Redis queue statistics for monitoring
 */
export interface RedisQueueStats {
  /** Current number of events in Redis queue */
  currentQueueLength: number;
  
  /** Maximum queue length threshold for backpressure */
  maxQueueLength: number;
  
  /** Current utilization percentage (0-100) */
  utilizationPercent: number;
  
  /** Total events enqueued since start */
  totalEnqueued: number;
  
  /** Total events dequeued since start */
  totalDequeued: number;
  
  /** Number of events dropped due to backpressure */
  droppedEvents: number;
  
  /** Whether backpressure is currently active */
  backpressureActive: boolean;
  
  /** Redis connection status */
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
  
  /** Number of Redis operation errors */
  operationErrors: number;
}

/**
 * Redis-based event queue with persistent storage and backpressure control
 * Uses Redis Lists for ordered event queuing with LPUSH/RPOP operations
 */
export interface RedisEventQueue {
  /**
   * Add event to Redis queue using LPUSH
   * @param event Event to enqueue
   * @throws Error if Redis is unavailable and fallback buffer is full
   */
  enqueue(event: EventEnvelope): Promise<void>;
  
  /**
   * Remove and return next event from Redis queue using RPOP
   * @returns Next event or null if queue is empty
   */
  dequeue(): Promise<EventEnvelope | null>;
  
  /**
   * Get current Redis queue length using LLEN
   * @returns Number of events currently in queue
   */
  getQueueLength(): Promise<number>;
  
  /**
   * Check if backpressure should be applied based on queue length
   * @returns True if queue length exceeds threshold (default 80% of max)
   */
  applyBackpressure(): Promise<boolean>;
  
  /**
   * Flush all events from Redis queue in chronological order
   * Uses LRANGE to get all events, then DEL to clear queue
   * @returns Array of all queued events in order
   */
  flush(): Promise<EventEnvelope[]>;
  
  /**
   * Get comprehensive Redis queue statistics
   * @returns Queue performance, utilization, and connection statistics
   */
  getStats(): Promise<RedisQueueStats>;
  
  /**
   * Clear all events from Redis queue
   * Used for testing and emergency situations
   */
  clear(): Promise<void>;
  
  /**
   * Check if Redis queue is empty
   * @returns True if no events are queued
   */
  isEmpty(): Promise<boolean>;
  
  /**
   * Set backpressure threshold for queue length
   * @param maxLength Maximum queue length before backpressure activates
   */
  setBackpressureThreshold(maxLength: number): void;
  
  /**
   * Handle Redis connection failures with fallback buffering
   * Switches to in-memory buffer when Redis is unavailable
   */
  handleConnectionFailure(): Promise<void>;
  
  /**
   * Restore connection to Redis and flush fallback buffer
   * Transfers events from in-memory buffer back to Redis
   */
  restoreConnection(): Promise<void>;
  
  /**
   * Get Redis connection health status
   * @returns Connection status and error information
   */
  getConnectionHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'failed';
    lastError?: string;
    reconnectAttempts: number;
  }>;
}