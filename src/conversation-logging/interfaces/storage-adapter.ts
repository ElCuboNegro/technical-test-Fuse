/**
 * Storage adapter interface for persistent data operations with failure handling
 * Requirements: 8.1, 8.2
 */

import { EventEnvelope } from './event-envelope';
import { AuditDTO } from './conversation-logger';

/**
 * Storage operation result with success/failure information
 */
export interface StorageResult {
  /** Whether the operation succeeded */
  success: boolean;
  
  /** Error message if operation failed */
  error?: string;
  
  /** Number of records affected */
  recordsAffected?: number;
  
  /** Operation duration in milliseconds */
  durationMs: number;
}

/**
 * Storage health status information
 */
export interface StorageHealth {
  /** Whether storage is currently available */
  isAvailable: boolean;
  
  /** Last successful operation timestamp */
  lastSuccessfulOperation?: Date;
  
  /** Current connection pool status */
  connectionPoolStatus: {
    active: number;
    idle: number;
    total: number;
  };
  
  /** Average operation latency in milliseconds */
  avgLatencyMs: number;
  
  /** Number of failed operations in last hour */
  recentFailures: number;
}

/**
 * Buffered event information during storage outages
 */
export interface BufferedEventInfo {
  /** Event that was buffered */
  event: EventEnvelope;
  
  /** Timestamp when event was buffered */
  bufferedAt: Date;
  
  /** Number of retry attempts */
  retryAttempts: number;
  
  /** Priority level for processing order */
  priority: 'audit' | 'normal' | 'debug';
}

/**
 * Storage adapter interface with failure handling and resilience
 * Implements persistent data operations with retry logic and buffering
 */
export interface StorageAdapter {
  /**
   * Insert event into persistent storage
   * @param event Event envelope to store
   * @returns Storage operation result
   */
  insertEvent(event: EventEnvelope): Promise<StorageResult>;
  
  /**
   * Insert audit record into immutable audit trail
   * @param audit Audit data to store
   * @returns Storage operation result
   */
  insertAudit(audit: AuditDTO): Promise<StorageResult>;
  
  /**
   * Update graph visualization data
   * @param event Event that affects graph structure
   * @returns Storage operation result
   */
  updateGraph(event: EventEnvelope): Promise<StorageResult>;
  
  /**
   * Handle storage outage by enabling local buffering
   * Switches to local buffer mode with size limits
   */
  handleStorageOutage(): Promise<void>;
  
  /**
   * Flush buffered events when storage is restored
   * Processes events in chronological order with priority handling
   */
  flushBufferedEvents(): Promise<StorageResult>;
  
  /**
   * Detect duplicate events to prevent double processing
   * @param event Event to check for duplicates
   * @returns True if event is a duplicate
   */
  detectDuplicates(event: EventEnvelope): Promise<boolean>;
  
  /**
   * Get current storage health status
   * @returns Storage availability and performance metrics
   */
  getStorageHealth(): Promise<StorageHealth>;
  
  /**
   * Get list of currently buffered events
   * @returns Array of buffered event information
   */
  getBufferedEvents(): Promise<BufferedEventInfo[]>;
  
  /**
   * Retry failed operations with exponential backoff
   * @param operation Function to retry
   * @param maxRetries Maximum number of retry attempts
   * @returns Operation result after retries
   */
  retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number
  ): Promise<T>;
  
  /**
   * Clear local buffer (for testing and emergency situations)
   */
  clearBuffer(): Promise<void>;
  
  /**
   * Set buffer size limit for local storage during outages
   * @param maxEvents Maximum number of events to buffer locally
   */
  setBufferLimit(maxEvents: number): void;
  
  /**
   * Enable or disable duplicate detection
   * @param enabled Whether to check for duplicates
   */
  setDuplicateDetection(enabled: boolean): void;
}