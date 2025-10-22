/**
 * Conversation logger interface for event processing and querying
 * Requirements: 8.1, 8.2
 */

import { EventEnvelope } from './event-envelope';

/**
 * Parameters for querying conversation graph data
 */
export interface GraphQueryParams {
  /** Session ID filter */
  sessionId?: string;
  
  /** Date range filter */
  startDate?: Date;
  endDate?: Date;
  
  /** Node type filter */
  nodeType?: string;
  
  /** Maximum number of results */
  limit?: number;
  
  /** Offset for pagination */
  offset?: number;
}

/**
 * Graph data transfer object for visualization
 */
export interface GraphDTO {
  /** Graph nodes with pseudonymized data */
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    metadata: Record<string, any>;
  }>;
  
  /** Graph edges showing conversation flow */
  edges: Array<{
    source: string;
    target: string;
    type: string;
    metadata: Record<string, any>;
  }>;
}

/**
 * Parameters for querying audit trail data
 */
export interface AuditQueryParams {
  /** Session ID filter */
  sessionId?: string;
  
  /** User ID filter (pseudonymized) */
  userId?: string;
  
  /** Date range filter */
  startDate?: Date;
  endDate?: Date;
  
  /** Event type filter */
  eventType?: string;
  
  /** Actor filter for access tracking */
  actor?: string;
  
  /** Maximum number of results */
  limit?: number;
  
  /** Offset for pagination */
  offset?: number;
}

/**
 * Audit data transfer object for compliance reporting
 */
export interface AuditDTO {
  /** Unique audit event ID */
  id: string;
  
  /** Session ID (pseudonymized) */
  sessionId: string;
  
  /** User ID (pseudonymized) */
  userId: string;
  
  /** Event type */
  eventType: string;
  
  /** Timestamp of the event */
  timestamp: Date;
  
  /** Pseudonymized summary of the event */
  summary: string;
  
  /** Actor who accessed the data (if applicable) */
  actor?: string;
  
  /** Additional metadata (PII-free) */
  metadata: Record<string, any>;
}

/**
 * Parameters for querying system metrics
 */
export interface MetricsQueryParams {
  /** Date range filter */
  startDate?: Date;
  endDate?: Date;
  
  /** Metric type filter */
  metricType?: string;
  
  /** Aggregation period (hour, day, week) */
  aggregation?: 'hour' | 'day' | 'week';
}

/**
 * Metrics data transfer object for monitoring
 */
export interface MetricsDTO {
  /** Metric name */
  name: string;
  
  /** Metric value */
  value: number;
  
  /** Timestamp */
  timestamp: Date;
  
  /** Metric type (counter, histogram, gauge) */
  type: 'counter' | 'histogram' | 'gauge';
  
  /** Additional labels (PII-free) */
  labels: Record<string, string>;
}

/**
 * Data consistency validation report
 */
export interface ConsistencyReport {
  /** Total sessions validated */
  totalSessions: number;
  
  /** Orphaned events found */
  orphanedEvents: number;
  
  /** Missing audit events */
  missingAuditEvents: number;
  
  /** Referential integrity violations */
  integrityViolations: Array<{
    type: string;
    description: string;
    count: number;
  }>;
  
  /** Overall consistency score (0-100) */
  consistencyScore: number;
}

/**
 * System statistics data transfer object
 */
export interface SystemStatsDTO {
  /** Total events processed */
  totalEvents: number;
  
  /** Events processed in last hour */
  eventsLastHour: number;
  
  /** Current buffer utilization percentage */
  bufferUtilization: number;
  
  /** Average write latency (ms) */
  avgWriteLatency: number;
  
  /** Average query latency (ms) */
  avgQueryLatency: number;
  
  /** Number of pseudonymization errors */
  pseudonymizationErrors: number;
  
  /** Storage outage count */
  storageOutages: number;
  
  /** System health status */
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
}

/**
 * Main conversation logger interface for event processing and querying
 * Operates as passive observer with pseudonymized data access
 */
export interface ConversationLogger {
  /**
   * Log an event asynchronously without blocking LangGraph runtime
   * @param event Event envelope to log
   */
  logEvent(event: EventEnvelope): Promise<void>;
  
  /**
   * Query conversation graph data with pseudonymized results
   * @param params Query parameters
   * @returns Graph visualization data
   */
  queryGraph(params: GraphQueryParams): Promise<GraphDTO>;
  
  /**
   * Query audit trail for compliance reporting
   * @param params Query parameters
   * @returns Audit trail data
   */
  queryAudit(params: AuditQueryParams): Promise<AuditDTO[]>;
  
  /**
   * Query system metrics for monitoring
   * @param params Query parameters
   * @returns Metrics data
   */
  queryMetrics(params: MetricsQueryParams): Promise<MetricsDTO>;
  
  /**
   * Validate data consistency across sessions, events, and audit records
   * @returns Consistency validation report
   */
  validateDataConsistency(): Promise<ConsistencyReport>;
  
  /**
   * Get current system statistics
   * @returns System performance and health statistics
   */
  stats(): Promise<SystemStatsDTO>;
}