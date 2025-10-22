/**
 * Event collector implementation for asynchronous, non-blocking event processing
 * Requirements: 2.1, 2.4, 5.4, 5.5
 */

import { EventEnvelope, EventType } from '../interfaces/event-envelope';
import { RedisEventQueue } from '../interfaces/redis-event-queue';
import { PseudonymizationEngine } from '../interfaces/pseudonymization-engine';

/**
 * Configuration for event collector retry logic
 */
export interface EventCollectorConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  
  /** Initial retry delay in milliseconds */
  initialRetryDelay: number;
  
  /** Exponential backoff multiplier */
  backoffMultiplier: number;
  
  /** Maximum retry delay in milliseconds */
  maxRetryDelay: number;
  
  /** Timeout for individual operations in milliseconds */
  operationTimeout: number;
}

/**
 * Default configuration for event collector
 */
export const DEFAULT_EVENT_COLLECTOR_CONFIG: EventCollectorConfig = {
  maxRetries: 3,
  initialRetryDelay: 100,
  backoffMultiplier: 2,
  maxRetryDelay: 5000,
  operationTimeout: 1000
};

/**
 * Event collector statistics for monitoring
 */
export interface EventCollectorStats {
  /** Total events processed */
  totalEvents: number;
  
  /** Events processed successfully */
  successfulEvents: number;
  
  /** Events that failed processing */
  failedEvents: number;
  
  /** Duplicate events detected */
  duplicateEvents: number;
  
  /** Current retry operations in progress */
  activeRetries: number;
  
  /** Total retry attempts made */
  totalRetries: number;
  
  /** Average processing time in milliseconds */
  avgProcessingTime: number;
}

/**
 * Event collector for asynchronous, non-blocking event processing
 * Implements duplicate detection, retry logic, and ensures LangGraph runtime is never blocked
 */
export class EventCollector {
  private readonly eventQueue: RedisEventQueue;
  private readonly pseudonymizationEngine: PseudonymizationEngine;
  private readonly config: EventCollectorConfig;
  private readonly processedEvents = new Set<string>();
  private readonly stats: EventCollectorStats;
  private readonly activeOperations = new Map<string, Promise<void>>();

  constructor(
    eventQueue: RedisEventQueue,
    pseudonymizationEngine: PseudonymizationEngine,
    config: EventCollectorConfig = DEFAULT_EVENT_COLLECTOR_CONFIG
  ) {
    this.eventQueue = eventQueue;
    this.pseudonymizationEngine = pseudonymizationEngine;
    this.config = config;
    this.stats = {
      totalEvents: 0,
      successfulEvents: 0,
      failedEvents: 0,
      duplicateEvents: 0,
      activeRetries: 0,
      totalRetries: 0,
      avgProcessingTime: 0
    };
  }

  /**
   * Accept event for processing without blocking the caller
   * Implements duplicate detection and asynchronous processing
   * @param event Event envelope to process
   */
  async acceptEvent(event: EventEnvelope): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Validate event type
      if (!Object.values(EventType).includes(event.event_type)) {
        this.stats.totalEvents++;
        this.stats.failedEvents++;
        return;
      }

      // Generate unique event key for duplicate detection
      const eventKey = this.generateEventKey(event);
      
      // Always count the event
      this.stats.totalEvents++;
      
      // Check for duplicates
      if (this.isDuplicate(eventKey)) {
        this.stats.duplicateEvents++;
        return; // Silently ignore duplicates
      }

      // Mark event as processed
      this.processedEvents.add(eventKey);

      // Process event asynchronously without blocking caller
      const processingPromise = this.processEventAsync(event);
      this.activeOperations.set(eventKey, processingPromise);

      // Clean up completed operations
      processingPromise.finally(() => {
        this.activeOperations.delete(eventKey);
        const processingTime = Date.now() - startTime;
        this.updateAverageProcessingTime(processingTime);
      });

      // Don't await - return immediately to avoid blocking
    } catch (error) {
      this.stats.failedEvents++;
      // Log error but don't throw to avoid blocking caller
      console.error('Event acceptance failed:', error);
    }
  }

  /**
   * Process event asynchronously with retry logic
   * @param event Event to process
   */
  private async processEventAsync(event: EventEnvelope): Promise<void> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.config.maxRetries) {
      try {
        // Apply timeout to prevent hanging operations
        await this.withTimeout(
          this.processEventOnce(event),
          this.config.operationTimeout
        );
        
        this.stats.successfulEvents++;
        return; // Success - exit retry loop
      } catch (error) {
        lastError = error as Error;
        attempt++;
        
        if (attempt <= this.config.maxRetries) {
          this.stats.totalRetries++;
          this.stats.activeRetries++;
          
          // Calculate exponential backoff delay
          const delay = Math.min(
            this.config.initialRetryDelay * Math.pow(this.config.backoffMultiplier, attempt - 1),
            this.config.maxRetryDelay
          );
          
          await this.sleep(delay);
          this.stats.activeRetries--;
        }
      }
    }

    // All retries exhausted
    this.stats.failedEvents++;
    console.error(`Event processing failed after ${this.config.maxRetries} retries:`, lastError);
  }

  /**
   * Process a single event (pseudonymize and enqueue)
   * @param event Event to process
   */
  private async processEventOnce(event: EventEnvelope): Promise<void> {
    // Pseudonymize the event payload
    const pseudonymizedPayload = await this.pseudonymizationEngine.pseudonymizePayload(event.payload);
    
    // Create pseudonymized event
    const pseudonymizedEvent: EventEnvelope = {
      ...event,
      payload: pseudonymizedPayload
    };

    // Enqueue for further processing
    await this.eventQueue.enqueue(pseudonymizedEvent);
  }

  /**
   * Generate unique key for event deduplication
   * Based on session_id, thread_id, step_index, and event_type
   * @param event Event to generate key for
   * @returns Unique event key
   */
  private generateEventKey(event: EventEnvelope): string {
    return `${event.session_id}:${event.thread_id}:${event.step_index || 'no-step'}:${event.event_type}`;
  }

  /**
   * Check if event is a duplicate
   * @param eventKey Event key to check
   * @returns True if event is duplicate
   */
  private isDuplicate(eventKey: string): boolean {
    return this.processedEvents.has(eventKey);
  }

  /**
   * Apply timeout to a promise
   * @param promise Promise to apply timeout to
   * @param timeoutMs Timeout in milliseconds
   * @returns Promise that rejects if timeout is exceeded
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Operation timeout')), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Sleep for specified duration
   * @param ms Duration in milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update average processing time with new measurement
   * @param processingTime New processing time measurement
   */
  private updateAverageProcessingTime(processingTime: number): void {
    const totalProcessed = this.stats.successfulEvents + this.stats.failedEvents;
    if (totalProcessed === 0) {
      this.stats.avgProcessingTime = processingTime;
    } else {
      this.stats.avgProcessingTime = 
        (this.stats.avgProcessingTime * (totalProcessed - 1) + processingTime) / totalProcessed;
    }
  }

  /**
   * Get current collector statistics
   * @returns Current statistics
   */
  getStats(): EventCollectorStats {
    return { ...this.stats };
  }

  /**
   * Clear processed events cache (for testing)
   */
  clearProcessedEvents(): void {
    this.processedEvents.clear();
  }

  /**
   * Get number of active operations
   * @returns Number of operations currently in progress
   */
  getActiveOperationsCount(): number {
    return this.activeOperations.size;
  }

  /**
   * Wait for all active operations to complete
   * Used for testing and graceful shutdown
   */
  async waitForActiveOperations(): Promise<void> {
    const operations = Array.from(this.activeOperations.values());
    await Promise.allSettled(operations);
  }
}