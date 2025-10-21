# Identity Verification Node Implementation Plan

- [ ] 1. Set up basic project structure for testing
  - Create apps/agents directory structure for LangGraph implementation
  - Set up package.json with testing dependencies (jest, @types/jest, ts-jest)
  - Create TypeScript configuration and test setup
  - Define basic test utilities and mock data structures
  - _Requirements: R6_

- [ ] 2. Write unit tests for core utilities (TDD approach)
  - [ ] 2.1 Create tests for ISO date validation function (valid dates, invalid formats, future dates, age validation)
  - [ ] 2.2 Write tests for SSN last-4 validation (4 digits, invalid formats, edge cases)
  - [ ] 2.3 Implement tests for PII hashing utilities (SHA-256 consistency, salt handling)
  - [ ] 2.4 Create tests for PII redaction functions (DOB and SSN masking)
  - _Requirements: R6, R1, R3_

- [ ] 3. Write integration tests for database operations
  - [ ] 3.1 Create tests for verifyIdentityFromDB function (success, failure, timeout scenarios)
  - [ ] 3.2 Write tests for database connection handling and error recovery
  - [ ] 3.3 Implement tests for rate limiting integration with Redis
  - [ ] 3.4 Create tests for conversation_events logging with proper redaction
  - _Requirements: R6, R1, R3_

- [ ] 4. Write state transition and routing tests
  - [ ] 4.1 Create test for successful verification on first attempt (Michael Thompson scenario)
  - [ ] 4.2 Write test for failure then success on retry (Kevin Park scenario)
  - [ ] 4.3 Implement test for two failures leading to termination (Jennifer Martinez scenario)
  - [ ] 4.4 Create tests for invalid input handling and validation errors
  - _Requirements: R6, R2, R5_

- [ ] 5. Write security and PII protection tests
  - [ ] 5.1 Create tests verifying no raw SSN appears in logs, state, or database
  - [ ] 5.2 Write tests for hash consistency across different operations
  - [ ] 5.3 Implement tests for memory cleanup after PII processing
  - [ ] 5.4 Create tests for fail-closed behavior on security errors
  - _Requirements: R6, R3_

- [ ] 6. Write end-to-end integration tests
  - [ ] 6.1 Create tests for complete LangGraph conversation flow integration
  - [ ] 6.2 Write tests for concurrent session isolation and state management
  - [ ] 6.3 Implement tests for all 13 test scenarios from design document
  - [ ] 6.4 Create performance tests for database operations under load
  - _Requirements: R6_

- [ ] 7. Implement input validation and sanitization (driven by tests)
  - Create ISO date validation function with semantic checks (age ≥18, not future, leap year handling)
  - Implement SSN last-4 format validation (4 digits only)
  - Add input sanitization and type checking with Zod schemas
  - Create validation error handling with proper reason codes
  - _Requirements: R1, R3_

- [ ] 8. Implement security and PII protection utilities (driven by tests)
  - Create SSN hashing utility with SHA-256 and environment-specific salt
  - Create DOB hashing utility with separate salt for database storage
  - Implement PII redaction functions for logging (DOB → ****-**-**, SSN → ****)
  - Add secure memory handling to overwrite raw PII after hashing
  - _Requirements: R3_

- [ ] 9. Create database boundary interface (driven by tests)
  - Implement verifyIdentityFromDB function with PII-safe design (boolean/enum results only)
  - Add PostgreSQL connection with timeout handling and connection pooling
  - Create fail-closed error handling for all database operations
  - Implement rate limiting checks with Redis integration
  - _Requirements: R1, R3_

- [ ] 10. Set up identity records database schema (driven by tests)
  - Create identity_records table with encrypted storage and proper indexing
  - Create conversation_events table for audit logging with redacted PII
  - Add database migration scripts and seeding utilities for test data
  - Implement database query logic with external_ref scoping and hash comparison
  - _Requirements: R1, R3_

- [ ] 11. Implement attempt tracking and state management (driven by tests)
  - Create attempt counter logic with configurable MAX_IDENTITY_ATTEMPTS
  - Implement deterministic state delta generation for success/failure paths
  - Add routing logic for identity → contact, identity → retry, identity → terminate
  - Create checkpointer integration for state persistence
  - _Requirements: R2, R5_

- [ ] 12. Add telemetry and event logging (driven by tests)
  - Create redacted telemetry event structure with session tracking
  - Implement event emission for verification attempts with proper metadata
  - Add reason tracking for failed verification attempts (DOB_MISMATCH, SSN_MISMATCH, etc.)
  - Create structured logging with conversation_events table integration
  - _Requirements: R3, R5_

- [ ] 13. Create identity verification node foundation (driven by tests)
  - Create identity verification node file with LangGraph RunnableLambda integration
  - Implement basic node interface with normalized input handling
  - Set up input/output type definitions for identity verification
  - Create conversation state management structure
  - _Requirements: R5, R1_

- [ ] 14. Integrate core node logic (driven by tests)
  - Combine validation, verification, and state management into complete node
  - Add proper error handling with fail-closed behavior for all edge cases
  - Implement complete routing logic for success/failure/termination paths
  - Add LangGraph integration with proper state annotations and reducers
  - _Requirements: R1, R2, R5_

- [ ] 15. Final integration and deployment preparation
  - Create LangGraph graph configuration with identity node integration
  - Add environment configuration management with proper secret handling
  - Implement monitoring and metrics collection (Prometheus integration)
  - Create deployment scripts and Docker configuration for agents service
  - _Requirements: R2, R5_

- [ ] 16. Validation and documentation
  - Validate all test scenarios from design document (13 test cases)
  - Create API documentation and integration guides
  - Add performance benchmarking and optimization
  - Verify compliance with security requirements and PII handling
  - _Requirements: R6, R3_