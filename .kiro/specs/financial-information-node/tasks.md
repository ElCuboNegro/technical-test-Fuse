# Financial Information Node Implementation Plan

- [ ] 1. Set up test fixtures and harness utilities
  - Create JSON test fixtures for all financial collection scenarios
  - Implement conversation replay harness with LangGraph integration
  - Set up financial event capture utilities for telemetry validation
  - Create TTS formatting test utilities and financial PII masking validators
  - _Requirements: R1, R2, R3, R6, R7_

- [ ] 1.1 Create income processing test fixtures
  - Create `financial_good_income_tenure.json` with standard monthly income and tenure
  - Create `financial_hourly_conversion.json` with hourly wage requiring conversion
  - Create `financial_annual_conversion.json` with annual salary requiring conversion
  - Create `financial_self_employed.json` with variable income scenario
  - _Requirements: R1_

- [ ] 1.2 Create tenure and discrepancy test fixtures
  - Create `financial_tenure_discrepancy.json` with stated tenure differing from threshold
  - Create `financial_approximate_tenure.json` with "about 2 years" format handling
  - Create `financial_invalid_income_then_fix.json` for income validation recovery
  - Create `financial_system_error.json` for database error simulation
  - _Requirements: R2, R4, R6_

- [ ] 2. Implement income processing unit tests
  - Write unit tests for income conversion from all supported periods
  - Create hourly to monthly conversion tests (25 * 40 * 52 / 12)
  - Implement annual to monthly conversion tests (amount / 12)
  - Test weekly and biweekly conversion formulas
  - _Requirements: R1_

- [ ] 2.1 Create income validation unit tests
  - Test income range validation (0 to $50,000 monthly)
  - Implement income format extraction from text tests
  - Create currency symbol and comma handling tests
  - Test invalid income amount detection and error handling
  - _Requirements: R1, R6_

- [ ] 2.2 Implement income voice formatting unit tests
  - Test income TTS formatting with natural currency speech
  - Create tests for various income amounts (1250 → "1,250 dollars")
  - Validate currency formatting without dollar signs
  - Test large amount formatting for voice clarity
  - _Requirements: R3_

- [ ] 3. Create tenure processing unit tests
  - Test tenure conversion from years to months (2 years → 24 months)
  - Implement combined year/month format tests ("2 years 3 months" → 27)
  - Create approximate tenure handling tests ("about 3 years" → 36)
  - Test tenure validation for reasonable ranges (0-600 months)
  - _Requirements: R2_

- [ ] 3.1 Implement tenure discrepancy detection unit tests
  - Test discrepancy detection with 3+ month threshold
  - Create empathy script generation tests with exact wording
  - Implement discrepancy handling state management tests
  - Test clarification acceptance and processing logic
  - _Requirements: R4_

- [ ] 3.2 Create tenure voice formatting unit tests
  - Test tenure TTS formatting for various periods
  - Create tests for years only (24 months → "2 years")
  - Test combined years and months (18 months → "1 year and 6 months")
  - Validate months only formatting (6 months → "6 months")
  - _Requirements: R3_

- [ ] 4. Implement financial node core logic unit tests
  - Test prerequisite verification (identity and contact must be complete)
  - Create state management and routing flag update tests
  - Implement financial progress tracking tests
  - Test error handling with specific error codes
  - _Requirements: R5, R6_

- [ ] 4.1 Create financial data extraction unit tests
  - Test structured extraction using Zod schemas
  - Implement income and period parsing from conversation text
  - Create tenure extraction from various input formats
  - Test validation of extracted financial data
  - _Requirements: R1, R2_

- [ ] 4.2 Implement financial node error handling unit tests
  - Test recoverable error generation for invalid inputs
  - Create format example provision for corrections
  - Implement system error handling with graceful recovery
  - Test error logging without financial PII exposure
  - _Requirements: R6, R7_

- [ ] 5. Implement income validation utilities
  - Create income conversion function for all supported periods
  - Build income range validation (0 to $50,000 monthly)
  - Implement income extraction from text with regex patterns
  - Create income format validation and sanitization
  - _Requirements: R1, R6_

- [ ] 5.1 Create income conversion logic
  - Implement hourly to monthly conversion (40 hrs/week * 52 weeks/year / 12)
  - Build weekly to monthly conversion (52 weeks/year / 12)
  - Create biweekly to monthly conversion (26 pay periods/year / 12)
  - Implement annual to monthly conversion (amount / 12)
  - _Requirements: R1_

- [ ] 6. Implement tenure validation utilities
  - Create tenure format conversion from various inputs
  - Build tenure validation for reasonable ranges
  - Implement approximate tenure handling ("about", "around")
  - Create tenure extraction from natural language input
  - _Requirements: R2_

- [ ] 6.1 Create tenure discrepancy handling system
  - Implement discrepancy detection with configurable threshold
  - Build empathy script generation with exact required wording
  - Create clarification handling and acceptance logic
  - Add discrepancy resolution tracking and state management
  - _Requirements: R4_

- [ ] 7. Create voice-optimized formatting utilities
  - Implement income TTS formatting with natural currency speech
  - Create tenure TTS formatting with clear time expressions
  - Build financial confirmation prompts for voice readback
  - Create empathy script formatting for discrepancy handling
  - _Requirements: R3_

- [ ] 8. Implement financial information node core logic
  - Create LangGraph node with prerequisite verification
  - Implement structured financial data extraction using normalization kit
  - Build income conversion and validation pipeline
  - Create tenure processing with discrepancy detection
  - _Requirements: R1, R2, R4, R5_

- [ ] 8.1 Add financial node state management
  - Implement state updates for collected financial data
  - Build progress tracking to prevent duplicate requests
  - Create routing flag management for confirmation node transition
  - Add telemetry events with financial PII redaction
  - _Requirements: R5, R7_

- [ ] 8.2 Create financial node error handling
  - Implement comprehensive error classification system
  - Build recovery strategies for validation failures
  - Create graceful error communication with format examples
  - Add secure error logging without financial PII exposure
  - _Requirements: R6, R7_

- [ ] 9. Run integration tests for complete financial collection flow
  - Test happy path with standard monthly income and tenure
  - Validate hourly wage conversion to monthly income
  - Test annual salary conversion to monthly income
  - Verify approximate tenure handling ("about 2 years")
  - _Requirements: R1, R2, R5_

- [ ] 9.1 Test discrepancy handling integration scenarios
  - Validate tenure discrepancy detection and empathy script delivery
  - Test clarification acceptance and processing
  - Verify self-employed variable income handling
  - Test invalid income format then correction flow
  - _Requirements: R4, R6_

- [ ] 9.2 Validate telemetry and security integration
  - Test financial PII redaction in all log events
  - Verify secure audit trail creation for financial collection
  - Validate session isolation and data protection
  - Test encryption and access control measures
  - _Requirements: R7_

- [ ] 10. Performance and load testing validation
  - Test node completion latency under load (p95 ≤ 1800ms with LLM)
  - Validate throughput with 150 RPS synthetic load
  - Check memory usage across 10k sequential invocations
  - Verify database connection pooling efficiency
  - _Requirements: R5, R7_

- [ ] 10.1 Concurrency and idempotency testing
  - Test parallel sessions with same user_id isolation
  - Validate idempotent re-invocation behavior
  - Test concurrent database writes and session management
  - Verify no cross-contamination of financial progress
  - _Requirements: R5, R7_

- [ ] 11. Final integration and validation
  - Integrate financial node with main conversation graph
  - Validate end-to-end financial information collection flow
  - Test voice-optimized confirmation and readback functionality
  - Verify database schema integration and data persistence
  - _Requirements: R1, R2, R3, R4, R5, R6, R7_