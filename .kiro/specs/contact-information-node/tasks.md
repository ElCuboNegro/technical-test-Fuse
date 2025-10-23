# Contact Information Node Implementation Plan (TDD Approach)

## Phase 1: Test Fixtures & Harness Setup

- [x] 1. Create test fixtures and harness utilities

  - Create `contact_good_address.json` fixture with full US address + email
  - Create `contact_no_email.json` fixture with full address, email omitted
  - Create `contact_multi_unit.json` fixture with multi-unit address detection
  - Create `contact_zip9.json` fixture with ZIP+4 format testing
  - _Requirements: R1, R2_

- [x] 1.1 Create error scenario test fixtures

  - Create `contact_invalid_zip_then_fix.json` for ZIP validation recovery
  - Create `contact_invalid_state_then_fix.json` for state validation recovery
  - Create `contact_system_error.json` for database error simulation
  - Create `contact_retry_email_spelling.json` for email confirmation retry
  - _Requirements: R5_

- [x] 1.2 Implement test harness utilities

  - Build `replayConversation(fixture)` function for LangGraph integration
  - Create `captureEvents()` function for conversation events collection
  - Implement `ttsFormat()` utilities for TTS output validation
  - Build `maskPII()` function for redaction verification
  - _Requirements: R3, R6_

## Phase 2: Unit Tests (TDD - Write Tests First)

- [x] 2. Write unit tests for address validation utilities (B1)

  - Test `normalizeAddress()` trims fields and uppercases state
  - Test ZIP normalization: "12345  " → "12345", ZIP+4 retained as XXXXX-XXXX
  - Test `validateState("ca") === true` and `validateState("XX") === false`
  - Test `validateZipCode("12345") === true`, `"12345-6789" === true`, `"1234" === false`
  - Test `validateAddress(address) === true` only when all required parts valid
  - _Requirements: R1.1, R1.2, R1.3, R1.4_

- [x] 2.1 Write unit tests for unit number detection (B2)

  - Test `detectMultiUnitAddress("2580 Broadway St Apt 15F") === true`
  - Test `handleUnitNumber(..., alreadyAsked=false)` prompts once and sets `unitNumberAsked=true`
  - Test second pass does NOT prompt again when `alreadyAsked=true`
  - Test unit number validation and normalization
  - _Requirements: R1.3, R1.4_

- [x] 2.2 Write unit tests for email validation & normalization (B3)

  - Test `validateEmail("  MiKe.Smith+dev@Gmail.com ") === true`
  - Test `normalizeEmail("  MiKe.Smith+dev@Gmail.com ") === "mike.smith+dev@gmail.com"`
  - Test email extraction from conversation text
  - Test common domain validation functionality
  - _Requirements: R2.1, R2.2, R6.2_

- [x] 2.3 Write unit tests for email spelling confirmation (B4)

  - Test first confirmation returns false → `{ lastError.code: "EMAIL_CONFIRMATION_FAILED", needs.contact: true }`
  - Test second confirmation returns true → success with `contact.email` persisted
  - Test email correction handling for failed confirmations
  - Test letter-by-letter spelling confirmation flow
  - _Requirements: R2.3, R2.4, R3.2_

- [x] 2.4 Write unit tests for voice formatting utilities (B5)

  - Test `formatZipForTTS("12345") === "1-2-3-4-5"`
  - Test `formatZipForTTS("12345-6789") === "1-2-3-4-5, dash, 6-7-8-9"`
  - Test `spellEmailForTTS("user@example.com")` includes "u-s-e-r  at  e-x-a-m-p-l-e  dot  c-o-m"
  - Test `formatAddressForTTS({ street:"123 Main St", city:"Anytown", state:"CA", zipCode:"12345" })` → `"123 Main St, Anytown, CA, 1-2-3-4-5"`
  - _Requirements: R3.1, R3.2, R3.3_

- [x] 2.5 Write unit tests for state management & routing flags (B6)

  - Test complete contact payload sets `needs: { identity:false, contact:false, financial:true, confirm:false }`
  - Test `contactProgress: { addressComplete:true, emailComplete:true, unitNumberAsked:true }`
  - Test idempotency: re-invocation does not duplicate or regress progress
  - Test routing flag management for financial node transition
  - _Requirements: R4.1, R4.2, R4.3, R4.4_

- [x] 2.6 Write unit tests for error handling (B7)

  - Test invalid state returns `lastError.code: "INVALID_STATE_CODE"`, `recoverable:true`, `needs.contact:true`
  - Test invalid ZIP returns `lastError.code: "INVALID_ZIP_FORMAT"`, `recoverable:true`, `needs.contact:true`
  - Test prerequisite verification failure when identity not verified
  - Test specific error code generation for all validation failures
  - _Requirements: R5.1, R5.2, R5.3, R5.4_

## Phase 3: Integration Tests (TDD - Write Tests First

- [x] 3. Write integration tests for happy path scenarios

  - Test C1: Happy path with email - full address + email in one utterance → `addressComplete:true`, `emailComplete:true`, route to `financial`
  - Test C2: Happy path without email - declares "no email" → `collected.contact.email` absent, still routes to `financial`
  - Test C3: Multi-unit prompt once - street implies unit, user supplies unit on prompt → `unitNumberAsked:true` exactly once, unit persisted
  - Test C6: ZIP+4 format - input "02139-4307" → accepts, TTS renders with "dash"
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R2.1, R2.2, R4.1, R4.2, R4.3, R4.4_

- [x] 3.1 Write integration tests for error recovery scenarios

  - Test C4: Invalid ZIP then fix - first `zip="12"` → error, next `zip="94107"` → success, two `conversation_events` (fail then success)
  - Test C5: Invalid state then fix - first `state="Cali"` → error, next `"CA"` → success, same pattern as C4
  - Test C7: Email spelling retry - first spelling confirmation "no", second "yes" → first returns recoverable error, second persists email
  - Test C8: System error recovery - simulate DB write error on first attempt → recoverable error, retry succeeds, telemetry logs error then success
  - _Requirements: R5.1, R5.2, R5.3, R5.4_

- [x] 3.2 Write integration tests for telemetry & logging (D)

  - Test event contains `session_id`, `user_id`, `node="contact"`, `event_type`, `attempt_number`, `success`, `reason?`
  - Test redactions: `address` redacted via `redactContactPII`, `email` logged as `"****@****.***"` when present
  - Test monotonic `attempt_number` per session
  - Test timestamps increase and DB rows exist for each attempt

  - _Requirements: R6.1, R6.2, R6.3, R6.4_

- [x] 3.3 Write performance & load tests (E)

  - Test node completion p50 ≤ 300ms, p95 ≤ 800ms (without LLM latency)
  - Test with LLM JSON extraction p95 ≤ 1500ms
  - Test 200 RPS synthetic with pooled PG connections, zero failed writes
  - Test no memory growth across 10k sequential invocations (leak check)
  - _Requirements: R4.3, R6.3_

- [x] 3.4 Write security & PII tests (F)

  - Test no raw street/city/state/ZIP/email in application logs, only redacted payloads
  - Test SQL parameters are bound (no string interpolation)
  - Test encryption-at-rest verified for `contact_information` table
  - Test access control: writes require session FK, orphan writes rejected
  - _Requirements: R6.1, R6.2, R6.3, R6.4_

- [x] 3.5 Write concurrency & idempotency tests (G)
  - Test parallel sessions with same `user_id` do NOT cross-contaminate `contactProgress`
  - Test re-invoking node with identical inputs is idempotent (no duplicate rows, no counter skew)
  - Test concurrent database writes and session management
  - Test session isolation and data protection
  - _Requirements: R4.3, R6.3_

- [x] 3.6 Write golden replay tests for voice/TTS (H)








  - Test exact TTS strings for address confirmation (with/without unit)
  - Test exact TTS strings for ZIP (5-digit and ZIP+4)
  - Test exact TTS strings for email spelling
  - Test TTS formatting change requires updating golden baselines (approval test)
  - _Requirements: R3.1, R3.2, R3.3, R3.4_

## Phase 4: Implementation (After Tests Are Written)

- [x] 4. Implement address validation utilities
  - Implement `validateState()` function with all 50 US states + DC validation
  - Create `validateZipCode()` function supporting 5-digit and 9-digit formats
  - Build `normalizeAddress()` function with trim and uppercase state normalization
  - Implement `detectMultiUnitAddress()` function for smart unit number detection
  - _Requirements: R1.1, R1.2, R1.3, R1.4_

- [x] 4.1 Implement email validation utilities

  - Implement `validateEmail()` function using standard email regex
  - Create `normalizeEmail()` function with lowercase and trim operations
  - Build `extractEmailFromText()` function for conversation parsing
  - Add `isCommonEmailDomain()` function for quality validation
  - _Requirements: R2.1, R2.2, R2.3, R2.4_

- [x] 4.2 Implement voice formatting utilities

  - Create `formatAddressForTTS()` function with natural pauses between components
  - Implement `spellEmailForTTS()` function with @ as "at" and . as "dot"
  - Build `formatZipForTTS()` function for digit-by-digit spelling
  - Add address confirmation prompt formatting for TTS readback
  - _Requirements: R3.1, R3.2, R3.3, R3.4_

- [x] 4.3 Create Zod schemas for structured extraction

  - Implement `AddressExtract` schema with street, city, state, zipCode, and optional unitNumber
  - Create `EmailExtract` schema for optional email validation
  - Build schema validation with proper error handling and type safety
  - Add schema coercion for consistent data formatting
  - _Requirements: R1.1, R1.2, R1.3, R2.1, R2.2_

## Phase 5: Core Node Implementation

- [x] 5. Implement contact node core logic

  - Create `contactNode` RunnableLambda with identity verification prerequisite check
  - Build structured address extraction using LLM with Zod schema validation
  - Implement unit number handling with single-request logic and progress tracking
  - Add email collection with optional handling and spelling confirmation
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R2.1, R2.2, R2.3, R2.4, R4.1, R4.2, R4.3, R4.4_

- [x] 5.1 Add contact node error handling and state management

  - Implement comprehensive error classification with specific error codes
  - Create state updates for collected contact data with proper routing flags
  - Build progress tracking to prevent duplicate unit number requests
  - Add telemetry events with PII redaction for security compliance
  - _Requirements: R4.1, R4.2, R4.3, R4.4, R5.1, R5.2, R5.3, R5.4, R6.1, R6.2, R6.3, R6.4_

- [x] 5.2 Create voice-optimized prompts and conversation logic

  - Implement `CONTACT_PROMPTS` object with TTS-optimized address collection prompts
  - Create unit number request prompts with clear apartment/suite/unit language
  - Build email collection prompts with optional communication and spelling confirmation
  - Add address and email confirmation prompts with proper TTS formatting
  - _Requirements: R3.1, R3.2, R3.3, R3.4_

- [x] 5.3 Implement helper functions for contact node

  - Create `extractWithSchema()` function for LLM-based structured extraction
  - Build `handleUnitNumber()` function with smart detection and single-request logic
  - Implement `confirmEmailSpelling()` function with letter-by-letter confirmation
  - Add `redactContactPII()` function for secure logging and telemetry
  - _Requirements: R1.3, R1.4, R2.3, R2.4, R6.4_

## Phase 6: Database Integration & Final Validation

- [x] 6. Create database integration for contact information






  - Implement `contact_information` table schema with proper foreign key constraints
  - Create database persistence functions with parameterized queries
  - Build contact data upsert logic with session-based updates
  - Add database indexes for performance optimization
  - _Requirements: R4.2, R4.3, R6.1, R6.3_

- [x] 6.1 Run all tests and validate implementation

  - Execute `npm test -- --testPathPattern=contact` and ensure all tests pass
  - Run `npm run build && npm run type-check` and verify no errors
  - Validate coverage ≥ 90% for `nodes/contact*`, `utils/*validation*`, `prompts/*`
  - Ensure no `console.log` in production code
  - _Requirements: All R1-R6_

- [x] 6.2 Final integration and deployment validation



  - Integrate contact node with main LangGraph conversation flow
  - Test end-to-end contact information collection with voice optimization
  - Validate database schema migration and data persistence
  - Verify all completion criteria are met and CI gates pass
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R2.1, R2.2, R2.3, R2.4, R3.1, R3.2, R3.3, R3.4, R4.1, R4.2, R4.3, R4.4, R5.1, R5.2, R5.3, R5.4, R6.1, R6.2, R6.3, R6.4_
