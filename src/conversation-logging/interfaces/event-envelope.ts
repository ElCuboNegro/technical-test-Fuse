/**
 * Core data structures for conversation logging and pseudonymization system
 * Requirements: 8.1, 8.2
 */

/**
 * Supported LangGraph event types for conversation logging
 */
export enum EventType {
  SESSION_STARTED = 'session_started',
  MESSAGE_USER = 'message_user',
  MESSAGE_AGENT = 'message_agent',
  TOOL_INVOCATION = 'tool_invocation',
  TOOL_RESULT = 'tool_result',
  NODE_ENTERED = 'node_entered',
  NODE_EXITED = 'node_exited',
  EDGE_TRANSITION = 'edge_transition',
  STATE_SNAPSHOT_REF = 'state_snapshot_ref',
  ERROR = 'error',
  TERMINATION = 'termination'
}

/**
 * Standardized event structure containing session metadata and payload information
 * This is the atomic data unit for all conversation logging operations
 */
export interface EventEnvelope {
  /** Unique session identifier for conversation tracking */
  session_id: string;
  
  /** Thread identifier within the session */
  thread_id: string;
  
  /** User identifier (will be pseudonymized) */
  user_id: string;
  
  /** LangGraph node that generated this event */
  node: string;
  
  /** Type of event from LangGraph runtime */
  event_type: EventType;
  
  /** Timestamp when the event occurred */
  timestamp: Date;
  
  /** Optional step index for event ordering within a session */
  step_index?: number;
  
  /** Event payload data (will be pseudonymized before persistence) */
  payload: Record<string, any>;
}