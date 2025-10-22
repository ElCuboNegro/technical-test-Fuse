/**
 * Async buffer interface for event queuing with backpressure control
 * Requirements: 8.1, 8.2
 */

import { EventEnvelope } from './event-envelope';

/**
 * Buffer statistics for monitoring
 */
export interface BufferStats {
  /** Current number of events in buffer */
  currentSize: number;
  
  /** Maximum buffer capacity */
  maxCapacity: number;
  
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
}

/**
 * Ring buffer interface with bounded memory and backpressure control
 * Implements circular buffer data structure for managing event queues
 */
export interface AsyncBuffer {
  /**
   * Add event to buffer queue
   * @param event Event to enqueue
   * @throws Error if buffer is full and backpressure is active
   */
  enqueue(event: EventEnvelope): Promise<void>;
  
  /**
   * Remove and return next event from buffer
   * @returns Next event or null if buffer is empty
   */
  dequeue(): Promise<EventEnvelope | null>;
  
  /**
   * Check if backpressure should be applied
   * @returns True if buffer utilization exceeds threshold (80%)
   */
  applyBackpressure(): boolean;
  
  /**
   * Get current buffer capacity utilization
   * @returns Utilization percentage (0-100)
   */
  getCapacityUtilization(): number;
  
  /**
   * Flush all buffered events in chronological order
   * @returns Array of all buffered events
   */
  flush(): Promise<EventEnvelope[]>;
  
  /**
   * Get current buffer statistics
   * @returns Buffer performance and utilization statistics
   */
  getStats(): BufferStats;
  
  /**
   * Clear all events from buffer
   * Used for testing and emergency situations
   */
  clear(): Promise<void>;
  
  /**
   * Check if buffer is empty
   * @returns True if no events are queued
   */
  isEmpty(): boolean;
  
  /**
   * Check if buffer is full
   * @returns True if buffer has reached maximum capacity
   */
  isFull(): boolean;
  
  /**
   * Set backpressure threshold percentage
   * @param threshold Threshold percentage (0-100)
   */
  setBackpressureThreshold(threshold: number): void;
}