/**
 * Redis event queue interface for persistent, ordered event queuing
 * Requirements: 2.2, 2.5, 5.3
 */

import { EventEnvelope } from './event-envelope';

/**
 * Statistics for Redis queue monitoring
 */
export interface RedisQueueStats {
  /** Current number of events in queue */
  currentQueueLength: number;
  
  /** Maximum allowed queue length */
  maxQueueLength: number;
  
  /** Queue utilization as percentage (0-100) */
  utilizationPercent: number;
  
  /** Total events enqueued since startup */
  totalEnqueued: number;
  
  /** Total events dequeued since startup */
  totalDequeued: number;
  
  /** Number of events dropped due to backpressure */
  droppedEvents: number;
  
  /** Whether backpressure is currently active */
  backpressureActive: boolean;
  
  /** Redis connection status */
  connectionStatus: 'connected' | 'disconnected';
  
  /** Number of operation errors encountered */
  operationErrors: number;
}

/**
 * Redis-based event queue interface for persistent storage and backpressure control
 */
export interface RedisEventQueue {
  /**
   * Add event to the queue
   * @param event Event to enqueue
   */
  enqueue(event: EventEnvelope): Promise<void>;
  
  /**
   * Remove and return next event from queue
   * @returns Next event or null if queue is empty
   */
  dequeue(): Promise<EventEnvelope | null>;
  
  /**
   * Get current queue length
   * @returns Number of events in queue
   */
  getQueueLength(): Promise<number>;
  
  /**
   * Check if backpressure should be applied
   * @returns True if queue is at backpressure threshold
   */
  applyBackpressure(): Promise<boolean>;
  
  /**
   * Remove all events from queue and return them
   * @returns All events that were in the queue
   */
  flush(): Promise<EventEnvelope[]>;
  
  /**
   * Get queue statistics
   * @returns Current queue statistics
   */
  getStats(): Promise<RedisQueueStats>;
  
  /**
   * Clear all events from queue
   */
  clear(): Promise<void>;
  
  /**
   * Check if queue is empty
   * @returns True if queue has no events
   */
  isEmpty(): Promise<boolean>;
  
  /**
   * Set backpressure threshold
   * @param maxLength Maximum queue length before backpressure
   */
  setBackpressureThreshold(maxLength: number): void;
  
  /**
   * Handle connection failure
   */
  handleConnectionFailure(): Promise<void>;
  
  /**
   * Restore connection and flush fallback buffer
   */
  restoreConnection(): Promise<void>;
  
  /**
   * Get connection health status
   * @returns Connection health information
   */
  getConnectionHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'failed';
    lastError?: string;
    reconnectAttempts: number;
  }>;
  
  /**
   * Close the queue connection
   */
  close(): Promise<void>;
}