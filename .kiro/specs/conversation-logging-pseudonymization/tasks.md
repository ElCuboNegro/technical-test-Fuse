# Implementation Plan

- [x] 1. Set up core data structures and interfaces









  - Create EventEnvelope interface with all required fields (session_id, thread_id, user_id, node, event_type, timestamp, step_index, payload)
  - Define EventType enum with all LangGraph event types (session_started, message_user, message_agent, tool_invocation, tool_result, node_entered, node_exited, edge_transition, state_snapshot_ref, error, termination)
  - Create TypeScript interfaces for PseudonymizationEngine, DatabasePseudonymizationEngine, ConversationLogger, AsyncBuffer, StorageAdapter, and ComplianceEngine
  - _Requirements: 8.1, 8.2_

- [x] 2. Implement pseudonymization engine with deterministic hashing





  - Create PseudonymizationEngine class with methods for maskSSN, maskDOB, maskEmail, bucketIncome
  - Implement deterministic hashing using SHA-256 with rotating salts from KMS
  - Add fail-closed error handling that masks entire fields with "[REDACTED]" on failure
  - Implement salt rotation logic with dual-read compatibility
  - _Requirements: 1.1, 1.4, 1.5, 6.1, 6.2, 6.3, 6.4, 6.5, 7.5_

- [x] 2.1 Write unit tests for pseudonymization engine


  - Test deterministic hashing produces same output for same input with same salt
  - Test all PII masking methods (SSN, DOB, email, income bucketing)
  - Test fail-closed behavior when pseudonymization fails
  - Test salt rotation with dual-read compatibility
  - _Requirements: 1.1, 1.4, 1.5, 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 3. Create Redis event queue with backpressure control






  - Implement RedisEventQueue class using Redis Lists (LPUSH/RPOP) for ordered queuing
  - Add backpressure logic that drops non-audit events when queue length exceeds threshold
  - Implement priority-based event handling (preserve audit events, drop debug events)
  - Add Redis connection management with reconnection logic and fallback buffering
  - Remove obsolete AsyncBuffer interface (replaced by RedisEventQueue)
  - _Requirements: 2.2, 2.5, 5.3_

- [x] 3.1 Write unit tests for Redis event queue


  - Test Redis queue operations (enqueue/dequeue) with proper ordering
  - Test backpressure activation when queue length exceeds threshold
  - Test priority-based event dropping (audit events preserved)
  - Test Redis connection failure handling and fallback mechanisms
  - _Requirements: 2.2, 2.5, 5.3_

- [-] 4. Implement event collector with asynchronous processing


  - Create ConversationLogger class with non-blocking logEvent method
  - Implement asynchronous event processing that never blocks LangGraph runtime
  - Add duplicate event detection based on session_id, thread_id, step_index, and event_type
  - Implement exponential backoff retry logic for failed operations
  - _Requirements: 2.1, 2.4, 5.4, 5.5_



- [x] 4.1 Write unit tests for event collector











  - Test non-blocking event acceptance for all EventType values
  - Test duplicate event detection and handling
  - Test retry logic with exponential backoff
  - Test that collector never blocks calling code
  - _Requirements: 2.1, 2.4, 5.4, 5.5_

- [x] 5. Create database schema with pseudonymization enforcement








  - Create conversation_events table with JSONB payload column and unique constraints
  - Create audit_events table with immutable triggers (prevent UPDATE/DELETE)
  - Create graph_nodes and graph_edges tables for visualization
  - Create pseudonym_cache table with TTL enforcement
  - _Requirements: 4.1, 4.2, 7.1, 7.2_

- [x] 6. Implement database-level PII protection triggers





  - Create PII detection trigger using regex patterns for SSN, DOB, email, address
  - Implement trigger that rejects writes containing raw PII patterns
  - Create stored procedures for field-level encryption
  - Implement row-level security policies for data access control
  - _Requirements: 1.3, 7.1, 7.2, 7.3_

- [x] 6.1 Write integration tests for database enforcement


  - Test that triggers block raw PII insertion
  - Test audit table immutability (UPDATE/DELETE rejected)
  - Test row-level security policies
  - Test field-level encryption functionality
  - _Requirements: 1.3, 7.1, 7.2, 7.3_

- [x] 7. Create storage adapter with failure handling
  - Implement StorageAdapter class with insertEvent, insertAudit, updateGraph methods
  - Add Redis persistence for storage outages with configurable queue limits
  - Implement chronological event flushing from Redis when storage is restored
  - Add connection pooling and timeout handling for both Redis and PostgreSQL
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 7.1 Write integration tests for storage adapter





  - Test storage outage handling with Redis persistence
  - Test chronological event flushing from Redis on recovery
  - Test connection timeout and retry behavior for both Redis and PostgreSQL
  - Test Redis queue overflow handling during extended outages
  - _Requirements: 5.1, 5.2, 5.3_