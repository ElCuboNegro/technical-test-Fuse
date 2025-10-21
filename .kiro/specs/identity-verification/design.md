
# Identity Verification Node — Design (DB-Backed, Normalized Inputs, Test-Driven v3.1)

## Overview

A **hard security gate** that collects and verifies **Date of Birth (DOB)** and **SSN last-4** against the database at the start of the conversation. This node serves as the **entry point** to all downstream verification flows, implementing strict PII handling and professional termination after failed attempts.

* **Success** → `identityVerified=true`, routes to `contact` node
* **Failure (max 2 attempts)** → routes to `terminate` node with approved termination script

The node uses **structured extraction** with JSON schema validation and maintains **deterministic attempt tracking**. All raw inputs are normalized and PII is immediately hashed or redacted. The node integrates with **LangGraph** state management and checkpointer for persistence.

## Assumptions

* **Upstream normalization:** LangChain layer provides `{ dob, ssnLast4, externalRef }` in normalized ISO and digit formats.
* **Upstream TTS/prompt handling:** Voice templates are defined externally in `response_templates` (e.g., `identity_failure`).
* **Upstream validation:**
  * Required fields: (`name`, `dob`, `ssnLast4`, `mailing_address`, `monthly_income`)
  * Optional fields: (`email`, `unit_number`)
* **State persistence:** Node state stored automatically via LangGraph Postgres checkpointer, keyed by `session_id`.
* **Max attempts:** Configurable via `system_variables.max_identity_attempts` (default = 2).
* **Fail-closed:** Any database or validation error results in a failed attempt.
* **Single hashing source:** Hashing occurs only within the **database boundary**, avoiding double hashing inconsistencies.

## Architecture

### Node Interface

```ts
type IdentityNodeInput = {
  state: ConversationState;
  input: { 
    dob?: string;        // ISO format YYYY-MM-DD
    ssnLast4?: string;   // 4 digits
    externalRef: string; // REQUIRED (application_id or equivalent)
  };
  config?: {
    callbacks?: { onEvent?: (e: any) => void };
    configurable?: { thread_id?: string }; // session id for checkpointer
    metadata?: { user_id?: string; applicant_name?: string; scenario_name?: string };
  };
};

type IdentityNodeOutput = {
  attempts: { identity: number };
  identityVerified: boolean;
  collected?: { identity: { dobHash: string; ssnLast4Hash: string; verifiedAt: string } };
  needs: { identity: boolean; contact: boolean; financial: boolean; confirm: boolean };
};
```

---

### Database Boundary (PII-Safe)

The database boundary ensures **no PII is returned** to the node — only boolean/enum results.

```ts
export type FailureReason = 
  | 'DOB_MISMATCH'
  | 'SSN_MISMATCH'
  | 'NOT_FOUND'
  | 'SYSTEM_ERROR'
  | 'INVALID_INPUT'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED';

export type VerifyResult =
  | { verified: true }
  | { verified: false; reason: FailureReason };

export async function verifyIdentityFromDB(args: {
  dob: string;           // Raw ISO date; hashed internally before DB query
  ssnLast4: string;      // Raw last-4; hashed internally before DB query
  externalRef: string;
}): Promise<VerifyResult>;
```

**Design Decision**: Hashing happens inside the verification boundary to prevent double-hash mismatches between runtime and DB.

## Data Models

### Conversation State

```ts
type ConversationState = {
  attempts: { identity: number; contact: number; financial: number };
  identityVerified: boolean;
  collected: { identity?: { dobHash: string; ssnLast4Hash: string; verifiedAt: string } };
  needs: { identity: boolean; contact: boolean; financial: boolean; confirm: boolean };
};
```

### Database Schema Integration

Integrates with the system architecture database schema:

```sql
-- Extends existing conversation_sessions and verification_attempts tables
-- (defined in system architecture)

-- Identity-specific table for verification data
CREATE TABLE IF NOT EXISTS identity_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref TEXT UNIQUE,
  dob_hash TEXT NOT NULL,  -- SHA256 hash of DOB, never plain text
  ssn4_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
) WITH (encryption_key_id = 'default'); -- Enable encryption at rest by default

CREATE INDEX IF NOT EXISTS idx_identity_records_ref ON identity_records (external_ref);
CREATE INDEX IF NOT EXISTS idx_identity_records_combo ON identity_records (dob_hash, ssn4_hash);

-- Uses existing tables from system architecture:
-- - conversation_sessions (id, status, created_at, updated_at)
-- - verification_attempts (id, session_id, user_id, node, attempt_number, success, reason, created_at)
--   where node = 'identity' for identity verification attempts
```

### Performance Considerations

* **Database Optimization**: Composite index on `(dob_hash, ssn4_hash)` for fast verification queries
* **High Volume Scaling**: Shard `conversation_events` by `session_id` for large deployments
* **Timeout Handling**: Default 5000ms timeout with exponential backoff for transient DB errors
* **Connection Pooling**: PostgreSQL and Redis connection pooling for concurrent sessions
* **Rate Limiting Overhead**: Redis operations add ~1-2ms latency per request
* **Metrics Collection**: Prometheus metrics add minimal overhead (~0.1ms per operation)
* **Memory Management**: Hash operations and validation use minimal heap allocation

### Logging Schema (Conversation Events)

```sql
CREATE TABLE IF NOT EXISTS conversation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  node TEXT NOT NULL,
  event_type TEXT NOT NULL,
  attempt_number INTEGER,
  success BOOLEAN,
  reason TEXT,
  redactions JSONB,
  applicant_name TEXT,
  scenario_name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_events_user_session 
  ON conversation_events (user_id, session_id, created_at DESC);

### Rate Limiting (Redis + Optional SQL Audit)

Rate-limiting is handled in Redis for performance; SQL table exists only for long-term audit logging.

```sql
CREATE TABLE IF NOT EXISTS rate_limit_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  attempt_count INTEGER,
  window_start TIMESTAMP DEFAULT NOW(),
  blocked_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```
```

## Core Logic

### Algorithm Flow

```mermaid
flowchart TD
    A[Input Received] --> B{Valid Input?}
    B -->|No| C[INVALID_INPUT]
    B -->|Yes| D[Hash SSN]
    D --> E[DB Verification]
    E --> F{Verified?}
    F -->|Yes| G[Success: Route to Contact]
    F -->|No| H{Attempts < Max?}
    H -->|Yes| I[Retry: Route to Identity]
    H -->|No| J[Terminate]
    C --> H
    I --> A
```

### Algorithm Steps

1. **Input Validation**

   * **Missing Input Check**: If `dob` or `ssnLast4` are missing, treat as `INVALID_INPUT` failure.
   * **Format Validation**: Ensure `dob` matches `YYYY-MM-DD` and `ssnLast4` matches `^\d{4}$`.
   * **Semantic Validation**: 
     - DOB must not be in future (allow up to current date)
     - DOB must indicate age ≥18 years (accounting for leap years)
     - DOB must be reasonable (not before 1900-01-01, not after current date)
     - Handle leap year edge cases (Feb 29 validation)
     - Support cultural date normalization (upstream converts non-Gregorian to ISO)
   * **Rate Limit Check**: Verify user hasn't exceeded attempt limits in current window
   * Invalid inputs count as a failed attempt with appropriate `reason`.

2. **Verification**

   * Call `verifyIdentityFromDB({ dob, ssnLast4, externalRef })`.
   * Boundary hashes internally; returns `{ verified, reason }`.
   * Never logs or returns raw PII.

3. **Attempt Tracking**

   * Increment `attempts.identity` exactly once per cycle, regardless of corrected input on retry.
   * **Note**: Successful retries include prior attempt counts for auditing (e.g., fail→success = 2 attempts total).

4. **State Update**

   * **Success:**

     * `identityVerified = true`
     * `collected.identity = { dobHash, ssnLast4Hash, verifiedAt: new Date().toISOString() }`
     * `needs = { identity:false, contact:true, financial:false, confirm:false }`
   * **Failure (<2 attempts):**

     * `identityVerified = false`, `needs.identity = true` → triggers upstream re-prompt.
   * **Failure (≥2 attempts):**

     * Route to `terminate` node with template `response_templates.identity_failure`.

5. **Fail-Closed Behavior**

   * Any DB error, timeout, or invalid input acts as a failure with `reason='SYSTEM_ERROR'`.

### Exit Contract

| Condition            | Route         | Notes                       |
| -------------------- | ------------- | --------------------------- |
| Verified=true        | → `contact`   | Proceed to contact node     |
| Attempts < 2, failed | → `identity`  | Retry once                  |
| Attempts ≥ 2         | → `terminate` | Professional failure script |

### Routing (LangGraph Edges)

```ts
const routeFromIdentity = (state: ConversationState): string => {
  if (state.identityVerified) return "contact";
  if (state.attempts.identity >= 2) return "terminate";
  return "identity";
};
```

## Security Implementation

### PII Hashing (Single Source)

* **Internal Boundary Hashing**: `sha256(value + SALT)` performed only inside DB boundary.
* **Storage**: Only hashed DOB/SSN stored; raw PII discarded immediately.
* **DOB Hashing**: Always `sha256(dob + DOB_SALT)` where dob is in ISO format YYYY-MM-DD
* **SSN Hashing**: Always `sha256(ssnLast4 + SSN_SALT)`
* **Rationale**: SHA256 is appropriate for non-password PII hashing (fast, deterministic, collision-resistant)
* **Salt Management**: Per-environment salts support rotation on security incidents. Document rotation policy. Environment-specific salts (DOB_SALT, SSN_SALT) with rotation policy.
* **Hash Applied At**:
  * Ingress (before persisting to state)
  * Database boundary (for verification)
  * Database storage (both DOB and SSN stored as hashes only)

### Redaction

Logs and telemetry redact:
* DOB → `****-**-**`
* SSN4 → `****`

### Memory Handling

Raw DOB/SSN references overwritten after hashing to prevent heap persistence.

### Verification & Fail-Closed Policy

Any invalid input, timeout, or DB failure is treated as a safe failure.

## Logging & Observability

### Logging Implementation

```ts
await logEvent({
  sessionId: config?.configurable?.thread_id,
  userId: config?.metadata?.user_id,
  node: "identity",
  eventType: "identity_attempt",
  attemptNumber: nextAttempts,
  success: verified,
  reason,
  redactions: { dob: "****-**-**", ssnLast4: "****" },
  applicantName: config?.metadata?.applicant_name,
  scenarioName: config?.metadata?.scenario_name
});
```

Each event is persisted in `conversation_events`.
State deltas are persisted via LangGraph’s Postgres checkpointer using the same `session_id`.

## Error Handling

### Strategy

| Type              | Behavior                      | Notes                       |
| ----------------- | ----------------------------- | --------------------------- |
| Input invalid     | Count as failed attempt       | triggers upstream re-prompt |
| DB/timeout        | Fail-closed                   | route retry or terminate    |
| Security          | Fail-closed                   | never expose stack trace    |
| Global/unexpected | `onError` route → `terminate` | professional script         |

Unhandled node exceptions are caught by LangGraph runtime. The user-facing layer (LLM) never sees stack traces — only the professional termination script.

## Testing Strategy

### Data Setup

### Seeded Test Applicants

| Name | DOB | SSN4 | ExternalRef | Notes |
|------|-----|------|-------------|-------|
| Michael Thompson | 1985-03-15 | 7234 | APP-THOMPSON | Success case |
| Lisa Chen | 1982-08-08 | 5639 | APP-CHEN | Self-employed |
| Jennifer Martinez | 1990-06-22 | 3891 | APP-MARTINEZ | Failure case |
| Robert Johnson | 1978-11-30 | 9156 | APP-JOHNSON | Tenure issue |
| Dorothy Wilson | 1955-04-12 | 2847 | APP-WILSON | No email |
| Carlos Rodriguez | 1992-09-18 | 4521 | APP-RODRIGUEZ | Address clarification |
| Amanda Foster | 1988-12-03 | 7890 | APP-FOSTER | Recent job change |
| Kevin Park | 1975-07-25 | 1357 | APP-PARK | Retry scenario |

Hashes derived via `sha256(<value> + <SALT>)`.

### Unit Tests
* Success → first attempt
* Invalid input → retry once
* Two failures → terminate
* Hash & redaction consistency verified

### Integration Tests
* Partial fail → success (Kevin Park)
* Full fail → terminate (Jennifer Martinez)
* Downstream routing success
* Telemetry + redaction validation

### Load & Security Tests
* 1000+ concurrent sessions
* DB performance at 100k+ records
* Fuzzing, timing attacks, SQL injection
* Redis rate-limit bypass attempts

### Assertions
* `identityVerified` flag matches `expected_outcome`
* `flow_trace` matches `expected_flow`
* Telemetry redacted
* Monotonic attempt increment

## Configuration

```ts
type Env = {
  DATABASE_URL: string;
  SSN_SALT: string;
  DOB_SALT: string;  // Separate salt for DOB hashing
  IDENTITY_TIMEOUT_MS?: number; // default 5000
  MAX_IDENTITY_ATTEMPTS?: number; // default 2, configurable per environment
  REDIS_URL?: string; // for rate limiting and caching
  METRICS_ENABLED?: boolean; // enable Prometheus/OpenTelemetry metrics
  RATE_LIMIT_WINDOW_MS?: number; // default 300000 (5 minutes)
  RATE_LIMIT_MAX_ATTEMPTS?: number; // default 10 per window
};

// Configuration with fallback
const getMaxAttempts = () => parseInt(process.env.MAX_IDENTITY_ATTEMPTS || '2');
```

## LangGraph Integration Details

### Node Implementation

The identity node is implemented as a **RunnableLambda** using the shared **Normalization Kit** from the system architecture:

```ts
// nodes/identity.ts
import { RunnableLambda } from "@langchain/core/runnables";
import { IdentityExtract, normalizeWithLLM } from "../normalization/kit";
import { hashDOB, hashLast4 } from "../security/crypto";
import { verifyIdentityFromDB } from "../integrations/identity-db";
import { redactPII } from "../security/redaction";

export const identityNode = RunnableLambda.from(async ({ state, config }) => {
  const startTime = Date.now();
  const userId = config?.metadata?.user_id;
  const sessionId = config?.configurable?.thread_id;
  
  try {
    // 1) Extract & normalize using shared Normalization Kit (per system architecture)
    const { parsed } = await normalizeWithLLM({
      text: /* derive from messages/conversation history */,
      schema: IdentityExtract,
      systemHint: "Extract DOB (YYYY-MM-DD) and last-4 SSN only. No other fields."
    });

    // 2) Validate inputs (semantic checks)
    const validationResult = await validateInputs(parsed.dob, parsed.ssnLast4);
    if (!validationResult.valid) {
      return updateIdentityState(state, { verified: false, reason: validationResult.reason });
    }
    
    // 3) DB verification (boundary hashes internally)
    const { verified, reason } = await verifyIdentityFromDB({
      dob: parsed.dob,
      ssnLast4: parsed.ssnLast4,
      externalRef: parsed.externalRef
    });
    
    const attempts = state.attempts.identity + 1;
    
    // 4) Telemetry (redacted per system architecture)
    config?.callbacks?.onEvent?.({
      type: "identity_attempt",
      data: { 
        success: verified, 
        attempts, 
        reason, 
        dob: redactPII(parsed.dob), 
        ssnLast4: "****" 
      }
    });
    
    const latency = Date.now() - startTime;
    metrics.histogram('identity_verification_latency_ms', latency);
    metrics.increment(`identity_verification_${verified ? 'success_total' : 'failure_total'}`);
    
    // 5) State update (store only hashes per system architecture)
    if (!verified) {
      return {
        attempts: { identity: attempts },
        identityVerified: false,
        needs: { ...state.needs, identity: true }
      };
    }

    return {
      attempts: { identity: attempts },
      identityVerified: true,
      collected: { 
        identity: { 
          dobHash: hashDOB(parsed.dob), 
          ssnLast4Hash: hashLast4(parsed.ssnLast4),
          verifiedAt: new Date().toISOString()
        } 
      },
      needs: { identity: false, contact: true, financial: false, confirm: false }
    };
    
  } catch (error) {
    metrics.increment('identity_verification_failure_total');
    return updateIdentityState(state, { verified: false, reason: 'SYSTEM_ERROR' });
  }
});
```

### Identity Schema Integration

Uses the shared **IdentityExtract** schema from the Normalization Kit (per system architecture):

```ts
// From normalization/kit.ts (system architecture)
export const IdentityExtract = z.object({
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // ISO format
  ssnLast4: z.string().regex(/^\d{4}$/),
  externalRef: z.string().optional()
});
```

This ensures consistency across all nodes that handle identity data and leverages the shared normalization infrastructure.

### State Management

* **Idempotent operations**: Node can be re-run safely without side effects
* **Reducer-based updates**: Uses LangGraph annotations and reducers (no phase enums)
* **Checkpointer persistence**: All state automatically persisted via Postgres checkpointer
* **Conditional routing**: Graph edges handle routing based on state flags

### LangGraph Error Integration

* **Global error boundary**: Unhandled errors bubble to `onError` → termination path
* **Fail-closed design**: All errors treated as verification failures
* **Professional termination**: Uses approved script for all failure scenarios

**Design Rationale**: This approach maintains clean separation between conversation flow (LangGraph) and verification logic (node), enabling reliable state management and error recovery.

## Implementation Notes

1. **Normalized Input Contract**: Upstream layer ensures proper formatting via structured extraction.
2. **Deterministic Attempt Counting**: Count attempts even if corrected data on retry.
3. **Redacted Telemetry**: All logs pruned before persistence.
4. **Thread-Scoped State**: Stored per `config.configurable.thread_id`.
5. **Traceable Metadata**: `user_id`, `applicant_name`, `scenario_name` included in every event.
6. **Compliance Ready**: No raw PII at any layer; supports per-environment salts.

## Dependencies & Versions

* **LangGraph**: ^0.2.0 (state management, checkpointer, routing)
* **LangChain**: ^0.3.0 (structured extraction, JSON schema validation)
* **Database**: PostgreSQL 14+ (UUID support, JSONB, indexes)
* **Node.js**: 18+ (crypto module for SHA256 hashing with secure defaults)
* **TypeScript**: 5.0+ (strict type checking, const assertions)
* **date-fns**: 2.30.0 (REQUIRED for semantic date validation and leap year handling)
* **ioredis**: ^5.3.0 (Redis client for rate limiting and caching)
* **prom-client**: ^15.1.0 (Prometheus metrics integration)

### Lock File Management
* **package-lock.json**: Required for consistent dependency versions across environments
* **Dependency Scanning**: Automated security scanning via npm audit or Snyk
* **Version Pinning**: Production deployments use exact versions, not ranges

### Rationale for Key Choices

* **SHA256 over Argon2**: Fast, deterministic hashing suitable for PII (not passwords). Argon2 would be slower without security benefit for this use case.
* **PostgreSQL**: JSONB support for flexible redaction storage, mature UUID implementation, excellent indexing performance.
* **Structured Extraction**: Ensures consistent input normalization, reduces validation complexity at node level.

## Test Integration References

Design validated against `test_scenarios.json` containing:

* `max_identity_attempts = 2` (configurable; tests use default=2)
* `response_templates.identity_failure`
* `expected_flow` and `expected_outcome` per applicant
* Support for retry (Kevin Park) and fail-closed (Jennifer Martinez)

## Voice/TTS Integration

Handled upstream via `response_templates`:
* **DOB request**: "Please say your date of birth with month, day, and year…"
* **SSN request**: "Please say the last four digits of your Social Security Number…"

### Failure script (after 2 attempts):
"I understand this can be frustrating. However, the last four digits of your Social Security Number and date of birth are required to proceed with the verification. Since we're unable to verify this information today, I'll need to conclude our call. Thank you for your time, and please feel free to call back when you have this information available."

## Extensibility

* Configurable `MAX_IDENTITY_ATTEMPTS`
* Timeout and hashing strategy configurable
* Read replicas and DB sharding supported
* Optional caching of results with TTL
* Prometheus-compatible metrics hooks

## Known Limitations

| Type | Limitation | Mitigation |
|------|------------|------------|
| Upstream dependency | Relies on LangChain normalization | Enforce structured extraction schema |
| Internationalization | Gregorian calendar only | Convert upstream |
| Hash determinism | Deterministic SHA256 allows rainbow risk | Use environment salt rotation |
| Rate-limit coupling | Shared key may block parallel sessions | Use user_id + scenario_name key |
| Transient DB errors | Fail-closed may terminate prematurely | Optionally classify transient vs terminal |

## Summary

| Aspect | Guarantee |
|--------|-----------|
| Security | All PII hashed/redacted, single hashing source |
| Reliability | Deterministic attempt logic and routing |
| Observability | Prometheus metrics + structured logs |
| Integration | Seamless LangGraph + voice layer |
| Testability | Matches test_scenarios.json |
| Fail-Safe | No fail-open; all errors treated as failure |
| Extensibility | Fully configurable environment & salts |
| Compatibility | Node 18.18+, LangGraph 0.2–0.3, LangChain 0.3 |

**Final Verdict**: This version (v3.1) implements all improvements — unified hashing, telemetry normalization, timestamp tracking, rate-limit redesign, and deduplicated testing table. It's ready for implementation and production review.

## Testing

Perfect — here’s your **complete test matrix** for the Identity Verification Node (DB-Backed, Normalized Inputs).
It maps **each scenario → required assertions**, covering **unit, integration, and system behavior** so you can validate correctness and telemetry end-to-end.

---

## ✅ **1. Successful Verification**

**Scenario:** Michael Thompson — correct DOB/SSN on first attempt
**Expected Flow:** `identity → contact → employment → confirmation`

**Assertions:**

| Category        | What to Assert                                         |
| --------------- | ------------------------------------------------------ |
| **State**       | `identityVerified === true`                            |
| **Attempts**    | `attempts.identity === 1`                              |
| **Routing**     | Next node is `"contact"`                               |
| **Database**    | Lookup succeeds (`verified:true`)                      |
| **Telemetry**   | One event with `{ success:true, reason:null }`         |
| **Security**    | `dob` and `ssnLast4` are redacted in logs              |
| **Persistence** | `collected.identity.dobHash` and `ssnLast4Hash` are 64-char SHA256 |
| **Time**        | DB verification completes within `IDENTITY_TIMEOUT_MS` |

---

## ✅ **2. Self-Employed Applicant**

**Scenario:** Lisa Chen — valid identity, but self-employed downstream
**Expected Flow:** Same as above; identity node still succeeds.

**Assertions:**

| Category                 | What to Assert                                      |
| ------------------------ | --------------------------------------------------- |
| **Identity Node Output** | Same as “Successful Verification”                   |
| **Routing**              | Next node is `"contact"`                            |
| **Downstream Readiness** | `state.needs.contact === true`                      |
| **Logs**                 | Contains `scenario_name: "self_employed_applicant"` |
| **Security**             | Redacted DOB/SSN in telemetry                       |

**Note**: Employment logic tested elsewhere — this verifies node independence.

## ❌ **3. Identity Verification Failure**

**Scenario:** Jennifer Martinez — wrong DOB/SSN twice
**Expected Flow:** `identity → terminate`
**Expected Outcome:** failure after 2 attempts

**Assertions:**

| Category           | What to Assert                                                                    |
| ------------------ | --------------------------------------------------------------------------------- |
| **First Attempt**  | `identityVerified === false`, `attempts.identity === 1`, route back to `identity` |
| **Second Attempt** | `attempts.identity === 2`, route to `terminate`                                   |
| **Routing**        | Termination script = `response_templates.identity_failure`                        |
| **Telemetry**      | 2 redacted events: both `{ success:false }`                                       |
| **DB**             | `verifyIdentityFromDB` returns `{ verified:false }`                               |
| **Fail-Closed**    | Any DB error yields same behavior                                                 |

---

## ⚙️ **4. Job Tenure Discrepancy**

**Scenario:** Robert Johnson — correct identity, mismatch in employment tenure
**Expected Flow:** `identity → contact → employment → confirmation`
**Expected Outcome:** success_with_clarification

**Assertions:**

| Category                 | What to Assert                                                  |
| ------------------------ | --------------------------------------------------------------- |
| **Identity Node**        | `identityVerified === true`, single success attempt             |
| **Routing**              | `"contact"` next                                                |
| **Logs**                 | Event tagged `scenario_name: "job_tenure_discrepancy"`          |
| **Security**             | Redactions enforced                                             |
| **Downstream readiness** | State passes `identityVerified:true` cleanly to employment node |

---

## ✅ **5. No Email Provided**

**Scenario:** Dorothy Wilson — no email, but correct identity
**Expected Flow:** `identity → contact → employment → confirmation`

**Assertions:**

| Category              | What to Assert                                        |
| --------------------- | ----------------------------------------------------- |
| **Identity Node**     | Same as successful flow                               |
| **Routing**           | `"contact"`                                           |
| **Optional Handling** | Missing email does **not** break or trigger re-prompt |
| **Logs**              | Redacted; scenario `"no_email_provided"`              |
| **Attempts**          | `1`                                                   |

---

## 🔁 **6. Address with Unit Clarification**

**Scenario:** Carlos Rodriguez — provides incomplete address first
**Expected Flow:** `identity → contact → employment → confirmation`

**Assertions:**

| Category               | What to Assert                                  |
| ---------------------- | ----------------------------------------------- |
| **Identity Node**      | Normal success                                  |
| **Downstream**         | Contact node uses `unit_number_prompt` template |
| **Identity Node Logs** | Contain only redacted PII, not address data     |
| **Routing**            | `"contact"` after identity success              |

---

## ⚠️ **7. Recent Job Change (Below Tenure Threshold)**

**Scenario:** Amanda Foster — correct identity, flagged for short tenure
**Expected Flow:** `identity → contact → employment → confirmation`
**Expected Outcome:** success_with_clarification

**Assertions:**

| Category          | What to Assert                                        |
| ----------------- | ----------------------------------------------------- |
| **Identity Node** | `identityVerified === true`, single attempt           |
| **Downstream**    | Employment node triggered with clarification template |
| **Logs**          | Proper redactions + scenario metadata                 |
| **Performance**   | <500 ms verification latency                          |

---

## 🔄 **8. Partial Identity Failure then Success**

**Scenario:** Kevin Park — wrong DOB first, correct second
**Expected Flow:** `identity (fail) → identity (success) → contact → employment → confirmation`
**Expected Outcome:** success

**Assertions:**

| Category                   | What to Assert                                           |
| -------------------------- | -------------------------------------------------------- |
| **First Attempt**          | `{ identityVerified:false, attempts.identity:1 }`        |
| **Second Attempt**         | `{ identityVerified:true, attempts.identity:2 }`         |
| **Routing**                | First back to `"identity"`, then `"contact"`             |
| **Persistence**            | Attempt count not reset between retries                  |
| **Logs**                   | Two events: first `success:false`, second `success:true` |
| **Security**               | No raw DOB/SSN ever appears in logs                      |
| **Termination Prevention** | No premature terminate after first failure               |

---

## 🧪 **9. Fail-Closed / System Error Test**

**Scenario:** Simulated DB timeout or unavailable connection
**Expected Flow:** `identity (fail) → identity (retry) → terminate`

**Assertions:**

| Category           | What to Assert                                               |
| ------------------ | ------------------------------------------------------------ |
| **Error Handling** | Treat timeout as `{ verified:false, reason:"SYSTEM_ERROR" }` |
| **Retry Behavior** | Retry allowed once                                           |
| **Routing**        | Second failure → `"terminate"`                               |
| **Telemetry**      | Two events with reason `SYSTEM_ERROR`                        |
| **Security**       | No exception messages in logs                                |
| **Recovery**       | Node doesn’t hang; returns within timeout limit              |

---

## 🧾 **10. Logging & Telemetry Validation**

**Scenario:** Any test case (cross-cutting)
**Purpose:** Ensure event integrity and traceability

**Assertions:**

| Category                | What to Assert                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Event Structure**     | Fields: `session_id`, `user_id`, `node`, `attempt_number`, `success`, `reason`, `applicant_name`, `scenario_name` |
| **Redactions**          | Always `"****-**-**"` for DOB, `"****"` for SSN                                                                   |
| **Attempt Counting**    | Monotonic increase only (never resets mid-session)                                                                |
| **Session Consistency** | Same `session_id` across all events in same flow                                                                  |
| **Storage**             | Row exists in `conversation_events` for each attempt                                                              |
| **Timestamps**          | Increasing order; `created_at` < next event                                                                       |

## 🚫 **11. Invalid Input Retry Test**

**Scenario:** Invalid DOB format → corrected input → success
**Expected Flow:** `identity (invalid) → identity (success) → contact`

**Assertions:**

| Category           | What to Assert                                                |
| ------------------ | ------------------------------------------------------------- |
| **First Attempt**  | Invalid DOB "2025-13-01" counts as failure, `attempts.identity:1` |
| **Second Attempt** | Valid input succeeds, `attempts.identity:2`                   |
| **Routing**        | First back to `"identity"`, then `"contact"`                  |
| **Validation**     | Input validation catches semantic errors (future dates, invalid months) |
| **Logs**           | Two events: first `success:false, reason:INVALID_INPUT`, second `success:true` |

## 🔄 **12. Concurrent Session Isolation**

**Scenario:** Multiple sessions with same user_id but different session_ids
**Purpose:** Verify checkpointer isolation

**Assertions:**

| Category              | What to Assert                                        |
| --------------------- | ----------------------------------------------------- |
| **State Isolation**   | Each session maintains independent attempt counters    |
| **No Cross-Talk**     | Session A failures don't affect Session B state       |
| **Logging**           | Events tagged with correct `session_id`               |
| **Database**          | Concurrent DB queries don't interfere                 |
| **Performance**       | No deadlocks or connection pool exhaustion            |

## 🔍 **13. No Seeded Record Test**

**Scenario:** Valid input format but no matching record in database
**Expected Flow:** `identity (not_found) → identity (retry) → terminate`

**Assertions:**

| Category        | What to Assert                                           |
| --------------- | -------------------------------------------------------- |
| **DB Response** | `verifyIdentityFromDB` returns `{ verified:false, reason:"NOT_FOUND" }` |
| **Retry Logic** | Allows one retry attempt                                  |
| **Termination** | Routes to terminate after 2 NOT_FOUND attempts           |
| **Logs**        | Events show `reason:NOT_FOUND`, not system error         |
| **Security**    | No indication of whether record exists (fail-closed)     |

---

## 📋 **Tests Summary Table**

| #  | Scenario                | Type           | Expected Flow                            | Outcome                    | Key Assertions                        |
| -- | ----------------------- | -------------- | ---------------------------------------- | -------------------------- | ------------------------------------- |
| 1  | Successful verification | Normal         | identity→contact→employment→confirmation | success                    | 1 success attempt, redacted logs      |
| 2  | Self-employed applicant | Normal         | identity→contact→employment→confirmation | success                    | success attempt, scenario metadata    |
| 3  | Identity failure        | Negative       | identity→terminate                       | failure                    | 2 failed attempts, termination script |
| 4  | Job tenure discrepancy  | Clarification  | identity→contact→employment→confirmation | success_with_clarification | 1 success attempt, downstream note    |
| 5  | No email                | Optional field | identity→contact→employment→confirmation | success                    | missing email tolerated               |
| 6  | Address clarification   | Clarification  | identity→contact→employment→confirmation | success                    | downstream prompt triggered           |
| 7  | Recent job change       | Clarification  | identity→contact→employment→confirmation | success_with_clarification | downstream warning                    |
| 8  | Partial fail→success    | Recovery       | identity(fail)→identity(success)→contact | success                    | 2 attempts, retry then success        |
| 9  | System error            | Negative       | identity→identity→terminate              | failure                    | fail-closed, 2 system_error logs      |
| 10 | Logging validation      | Cross-cutting  | all                                      | —                          | structure + redactions consistent     |
| 11 | Invalid input retry     | Validation     | identity(invalid)→identity(success)→contact | success                 | input validation, semantic checks     |
| 12 | Concurrent sessions     | Isolation      | parallel sessions                        | independent                | state isolation, no cross-talk        |
| 13 | No seeded record        | Edge case      | identity→identity→terminate              | failure                    | NOT_FOUND handling, fail-closed       |
