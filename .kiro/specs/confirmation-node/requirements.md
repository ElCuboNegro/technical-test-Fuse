# Confirmation Node — Simplified Spec (TTS-Optimized, Final Gate)

## 1) Purpose

The **final verification step** that provides a comprehensive, **TTS-friendly summary** of all collected information and obtains **explicit user confirmation** before completing the verification process. On confirmation, it marks the verification as complete; on rejection, it routes to appropriate correction flow.

## 2) Definitions (minimal)

* **Confirmation node**: LangGraph node that summarizes collected data and obtains final user confirmation
* **TTS summary**: Voice-optimized format for reading back all collected information
* **Final confirmation**: Explicit yes/no user response to complete verification
* **Collected data**: All verified information from identity, contact, and financial nodes
* **Voice formatting**: Specialized formatting for clear speech synthesis (digits, dates, money, addresses)

## 3) Inputs & Outputs

### Inputs (from graph/state)

* `state.collected.identity` (hashed DOB/SSN4 from identity node)
* `state.collected.contact` (address, optional email from contact node)  
* `state.collected.financial` (monthly income, job tenure from financial node)
* `state.needs.confirm` (boolean flag indicating confirmation is needed)
* Config callbacks for logging/telemetry

### Outputs (state deltas)

* **On confirmation:**
  * `verificationComplete = true`
  * `needs = { identity:false, contact:false, financial:false, confirm:false }`
  * `completedAt = timestamp`
* **On rejection:**
  * `verificationComplete = false`
  * `needs = { identity:false, contact:true, financial:false, confirm:false }` (route to correction)
* **On unclear response:**
  * `needs.confirm = true` (retry confirmation)

## 4) Functional Requirements

### R1 — TTS-Friendly Summary Generation

* Generate complete summary of all collected data using **voice-optimized formatting**.
* Present information in logical order: identity confirmation, contact details, financial information.
* Use **natural speech patterns** with appropriate pauses for comprehension.

**Acceptance**

1. Email addresses spelled letter-by-letter with clear pronunciation.
2. Monetary amounts in natural speech ("six thousand five hundred dollars").
3. Dates in full word format ("March fifteenth, nineteen eighty-five").
4. Addresses with natural pauses between components.

### R2 — Explicit Confirmation Collection

* Request explicit user confirmation after presenting complete summary.
* Accept clear affirmative/negative responses.
* Handle unclear responses with yes/no clarification.

**Acceptance**

1. Accept "yes", "correct", "that's right" as confirmation.
2. Accept "no", "incorrect", "that's wrong" as rejection.
3. Request clarification for unclear responses.
4. Single interaction cycle for confirmation collection.

### R3 — State Management & Routing

* Execute only when all prerequisite nodes (identity, contact, financial) are complete.
* Update verification status based on user confirmation.
* Route appropriately based on confirmation response.

**Acceptance**

1. Verify prerequisite completion before execution.
2. Set `verificationComplete = true` on confirmation.
3. Route to correction flow on rejection.
4. Emit completion telemetry with session tracking.

### R4 — Security & Compliance

* Maintain security standards during confirmation process.
* Redact sensitive PII in all logging and telemetry.
* Use only hashed/masked versions of identity data.

**Acceptance**

1. No raw PII in logs or telemetry events.
2. Hashed identity data in confirmations.
3. Audit trail of confirmation decisions.
4. Fail-closed error handling.

### R5 — LangGraph Integration

* Integrate seamlessly with LangGraph state management and checkpointer.
* Support idempotent operations and proper state transitions.
* Handle errors gracefully with appropriate routing.

**Acceptance**

1. Uses annotations/reducers (no phase enums).
2. Conditional edges match confirmation outcomes.
3. Checkpointer persists state transitions.

### R6 — Testing

* Comprehensive test coverage for confirmation scenarios.
* Voice formatting validation in automated tests.
* Security tests confirming no PII exposure.

**Acceptance**

1. Unit tests for confirmation/rejection scenarios.
2. Voice formatting tests for all data types.
3. Integration tests for routing behavior.
4. Security tests verify PII redaction.

## Completion Criteria (Atomic)

**This unit is complete when:**

* [ ] Information summary generation works with complete data collection from all previous nodes
* [ ] Voice formatting utilities properly format all data types (dates, money, addresses, emails)
* [ ] Explicit confirmation collection handles yes/no responses and unclear input clarification
* [ ] State management correctly updates verification completion status and routes appropriately
* [ ] Security measures ensure no raw PII appears in logs, telemetry, or confirmation summaries
* [ ] LangGraph integration maintains proper state transitions and checkpointer persistence
* [ ] Unit tests pass for all confirmation scenarios and voice formatting requirements
* [ ] Integration tests confirm end-to-end flow from financial node to completion
* [ ] Security tests verify PII redaction and audit trail compliance
* [ ] Build compiles without errors and TypeScript validation passes

## Success Validation

```bash
# Run tests for this atomic unit only
npm test -- --testPathPattern=confirmation

# Verify build compiles
npm run build

# Check TypeScript types
npm run type-check

# Validate voice formatting
npm test -- --testNamePattern="voice formatting"

# Test integration with previous nodes
npm test -- --testNamePattern="confirmation integration"
```

## Voice Formatting Examples

**Expected TTS-friendly outputs:**

* **Email**: "Your email address is M-T-H-O-M-P-S-O-N dot D-E-N-V-E-R at G-M-A-I-L dot com"
* **Date**: "Your date of birth is March fifteenth, nineteen eighty-five"
* **Money**: "Your monthly income is six thousand five hundred dollars"
* **Address**: "Your mailing address is twelve forty-seven Oak Street, Unit three B, Denver, Colorado, eight zero two zero two"
* **Final Confirmation**: "Is all of this information correct? Please say yes or no."

## Completion Criteria (Atomic)

**This unit is complete when:**

- [ ] All 12 test scenarios pass with expected assertions
- [ ] Voice formatting handles all data types and edge cases correctly
- [ ] Security tests verify no PII exposure in any scenario
- [ ] Performance tests confirm sub-2000ms summary generation
- [ ] Concurrent session tests show proper isolation
- [ ] Integration tests confirm proper routing for all outcomes
- [ ] Build compiles without errors and TypeScript validation passes

## Success Validation

```bash
# Run all confirmation node tests
npm test -- --testPathPattern=confirmation --silent

# Verify voice formatting specifically
npm test -- --testNamePattern="voice formatting" --silent

# Test security and PII redaction
npm test -- --testNamePattern="security|PII" --silent

# Performance and concurrency tests
npm test -- --testNamePattern="performance|concurrent" --silent

# Integration with previous nodes
npm test -- --testNamePattern="confirmation integration" --silent
```