# Voice Verification Agent — Final System Architecture (Scoped, Node-Local Normalization + Shared LLM+Zod Kit)

## Overview

A LangGraph-based agent for **multi-step financial verification** with a **strict identity gate**, **professional failure handling**, and **voice-optimized** responses.  
Each node **extracts & normalizes its own domain data** via a **shared LLM+Zod Normalization Kit**, preserving **least-privilege** and the **no-bypass** identity gate.

- **Identity node**: the *only* place that touches DOB/SSN4; verifies against the database; gates the rest of the flow.
- **Contact node**: address + optional email (normalized via the kit), with unit-number prompt logic and email spelling confirmation.
- **Financial node**: income + tenure (normalized and converted via the kit), with discrepancy handling.
- **Confirmation node**: TTS-friendly summary and final confirmation.
- **Termination node**: scope-approved professional script.

Out of scope: vendor-specific STT/TTS, analytics dashboards, RAG/memory, complex multi-tenant policy engines.

## System Architecture Principles

### 1) Security-First

- **Hard identity gate**; no downstream nodes run before `identityVerified===true`.
- **Least-privilege**: each node only processes fields it owns.
- **PII protection**: hash SSN4 at ingress, redact DOB/SSN in logs, store only hashed values.
- **Fail-closed**: any error behaves like a verification failure.

### 2) Voice-Optimized

- TTS-friendly formats (digits, dates, money, email spelling).
- Short, empathetic prompts; confirmation loops for accuracy.

### 3) Production-Ready (scope-only)

- LangGraph state/edges + Postgres checkpointer.
- DB boundary for identity verification (boolean/enum only; never returns PII).
- Structured, redacted event logging with `session_id`, `user_id`, `node`, and attempt numbers.

---

## High-Level Architecture

```mermaid
graph TB
  subgraph "Client Layer"
    VOICE[Voice Interface]
    WEB[Web UI (ops/QA)]
  end

  subgraph "Application Layer"
    ORCH[LangGraph Orchestrator]
    subgraph "Agent Services"
      VVA[Voice Verification Agent]
      IPA[Intent Parser (lightweight)]
      HCA[Health Check]
    end
  end

  subgraph "Shared Capability"
    NKIT[Normalization Kit (LLM + Zod)]
  end

  subgraph "Data & Infra"
    PG[(PostgreSQL: checkpointer + audit)]
    IDDB[(PostgreSQL: identity_records)]
    REDIS[(Redis: optional rate limits)]
    LLM[LLM Provider (JSON mode)]
    LOGS[Structured Logging/Monitoring]
  end

  VOICE --> ORCH
  WEB --> ORCH
  ORCH --> VVA
  ORCH --> IPA
  ORCH --> HCA

  VVA --> PG
  VVA --> IDDB
  VVA --> REDIS
  VVA --> LLM
  VVA --> NKIT
  VVA --> LOGS
````

**Key decision:** *Do not* centralize extraction/normalization in a single node.
**Do** centralize **how** it’s done via a reusable **Normalization Kit** invoked by each node for its own fields.

---

## Conversation Flow (Scope)

1. **Identity Verification (Critical Gate)**

   - Collect & normalize DOB (month/day/year → ISO) + SSN last-4 (digits).
   - Verify against `identity_records`.
   - On failure: up to **2** attempts, then professional termination.

2. **Contact Information (Post-Identity)**

   - Full mailing address (street, city, state, ZIP), smart **unit number** prompt (ask once).
   - Optional email: validate + **letter-by-letter** spelling confirmation.

3. **Financial Information**

   - Monthly income (accept annual/hourly; convert silently).
   - Job tenure (months); compare to threshold; if discrepancy, use empathy script.

4. **Final Confirmation**

   - TTS-friendly readback and explicit confirmation.

---

## LangGraph Implementation

### State (Annotations + Reducers; capability flags—no phase enums)

```ts
import { Annotation } from "@langchain/langgraph";
import { z } from "zod";

export const IdentityZ = z.object({
  dobHash: z.string().optional(),        // SHA-256(dob + DOB_SALT)
  ssnLast4Hash: z.string().optional()    // SHA-256(last4 + SSN_SALT)
});

export const ContactZ = z.object({
  address: z.any().optional(),           // structured, no PII in logs
  email: z.string().email().optional()
});

export const FinancialZ = z.object({
  monthlyIncome: z.number().optional(),
  jobTenureMonths: z.number().optional()
});

export const VerificationState = Annotation.Root({
  identityVerified: Annotation<boolean>({ default: false }),
  attempts: Annotation<{ identity: number }>({ default: { identity: 0 } }),
  collected: Annotation<{
    identity: z.infer<typeof IdentityZ>;
    contact: z.infer<typeof ContactZ>;
    financial: z.infer<typeof FinancialZ>;
  }>({
    default: { identity: {}, contact: {}, financial: {} },
    reducer: (prev, next) => ({
      identity:  { ...prev.identity,  ...next.identity },
      contact:   { ...prev.contact,   ...next.contact },
      financial: { ...prev.financial, ...next.financial },
    }),
  }),
  thresholds: Annotation<{ jobTenureMinMonths: number }>({
    default: { jobTenureMinMonths: 15 },
  }),
  needs: Annotation<{ identity: boolean; contact: boolean; financial: boolean; confirm: boolean }>({
    default: { identity: true, contact: false, financial: false, confirm: false }
  }),
  lastError: Annotation<{ code: string; recoverable: boolean } | null>({ default: null }),
});
```

### Graph (conditional edges + checkpointer + global error route)

```ts
import { StateGraph, START, END } from "@langchain/langgraph";
import { VerificationState } from "./state";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { identityNode, contactNode, financialNode, confirmNode, terminateNode } from "./nodes";

const g = new StateGraph(VerificationState)
  .addNode("identity", identityNode)
  .addNode("contact", contactNode)
  .addNode("financial", financialNode)
  .addNode("confirm", confirmNode)
  .addNode("terminate", terminateNode)
  .addEdge(START, "identity")
  .addConditionalEdges("identity", ({ state }) => {
    if (state.identityVerified) return "contact";
    if (state.attempts.identity >= 2) return "terminate";
    return "identity";
  })
  .addConditionalEdges("contact", ({ state }) => state.needs.financial ? "financial" : "confirm")
  .addConditionalEdges("financial", () => "confirm")
  .addEdge("confirm", END)
  .addEdge("terminate", END);

export const app = g.compile({
  checkpointer: new PostgresSaver({ /* pg pool */ }),
  onError: async (err, ctx) => {
    ctx.update({ lastError: { code: err.name, recoverable: false } });
    return "terminate";
  },
});
```

---

## Normalization Kit (Shared Capability)

A small library used by **each node** to do **LLM JSON-mode extraction + Zod validation** consistently.

```ts
// normalization/kit.ts
import { z } from "zod";
import { callLLMJson } from "./llm-json"; // wraps provider with response_format/json + retries

export async function normalizeWithLLM<T>(
  input: { text: string; schema: z.ZodSchema<T>; systemHint?: string; fewShot?: Array<{user:string;assistant:string}> }
): Promise<{ parsed: T; warnings?: string[] }> {
  const raw = await callLLMJson({ text: input.text, systemHint: input.systemHint, fewShot: input.fewShot });
  const parsed = input.schema.parse(raw); // throws if invalid
  return { parsed };
}

// Reusable schemas
export const IdentityExtract = z.object({
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // ISO
  ssnLast4: z.string().regex(/^\d{4}$/),
  externalRef: z.string().optional()
});

export const AddressExtract = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),                     // normalized to 2-letter
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/),
  unitNumber: z.string().optional()
});

export const EmailExtract = z.object({
  email: z.string().email().optional()
});

export const FinancialExtract = z.object({
  // Accept rich inputs; normalize to monthly income + tenure months
  incomeInput: z.union([z.string(), z.number()]),
  incomePeriod: z.enum(["hourly","weekly","biweekly","monthly","annual"]).optional(),
  jobTenureMonths: z.number().int().min(0)
});
```

---

## Core Nodes (with Node-Local Normalization)

### Identity Node (hard gate; the only node that handles DOB/SSN4)

```ts
// nodes/identity.ts
import { RunnableLambda } from "@langchain/core/runnables";
import { IdentityExtract, normalizeWithLLM } from "../normalization/kit";
import { hashDOB, hashLast4 } from "../security/crypto";
import { verifyIdentityFromDB } from "../integrations/identity-db";
import { redactPII } from "../security/redaction";

export const identityNode = RunnableLambda.from(async ({ state, config }) => {
  // 1) Extract & normalize (LLM+Zod) from conversation text/history
  const { parsed } = await normalizeWithLLM({
    text: /* derive from messages/turn text */,
    schema: IdentityExtract,
    systemHint: "Extract DOB (YYYY-MM-DD) and last-4 SSN only. No other fields."
  });

  // 2) DB verification (boundary hashes internally as well)
  const { verified, reason } = await verifyIdentityFromDB({
    dob: parsed.dob,
    ssnLast4: parsed.ssnLast4,
    externalRef: parsed.externalRef
  });

  const attempts = state.attempts.identity + 1;

  // 3) Telemetry (redacted)
  config?.callbacks?.onEvent?.({
    type: "identity_attempt",
    data: { success: verified, attempts, reason, dob: redactPII(parsed.dob), ssnLast4: "****" }
  });

  // 4) State update (store only hashes)
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
    collected: { identity: { dobHash: hashDOB(parsed.dob), ssnLast4Hash: hashLast4(parsed.ssnLast4) } },
    needs: { identity: false, contact: true, financial: false, confirm: false }
  };
});
```

### Contact Node (uses kit for address/email; runs only after identity)

```ts
// nodes/contact.ts
import { RunnableLambda } from "@langchain/core/runnables";
import { AddressExtract, EmailExtract, normalizeWithLLM } from "../normalization/kit";
import { redactContactPII } from "../security/redaction";

export const contactNode = RunnableLambda.from(async ({ state, config }) => {
  if (!state.identityVerified) return { lastError: { code: "IDENTITY_NOT_VERIFIED", recoverable: false } };

  const { parsed: addr } = await normalizeWithLLM({
    text: /* conversation text */,
    schema: AddressExtract,
    systemHint: "Extract US mailing address fields; normalize state to two-letter code."
  });

  // Smart unit number prompt (ask once if missing & likely multi-unit)
  const needsUnit = !addr.unitNumber && likelyMultiUnit(addr.street);
  if (needsUnit && /* not asked yet */ false) {
    return { needs: { ...state.needs, contact: true }, contactProgress: { unitNumberAsked: true } };
  }

  const { parsed: em } = await normalizeWithLLM({
    text: /* conversation text */,
    schema: EmailExtract,
    systemHint: "Extract email if present, else return null."
  });

  config?.callbacks?.onEvent?.({
    type: "contact_collected",
    data: {
      addressComplete: true,
      emailProvided: !!em.email,
      address: redactContactPII(addr),
      email: em.email ? "****@****.***" : null
    }
  });

  return {
    collected: { contact: { address: addr, email: em.email?.trim().toLowerCase() } },
    needs: { identity: false, contact: false, financial: true, confirm: false },
    contactProgress: { addressComplete: true, emailComplete: true, unitNumberAsked: true }
  };
});
```

### Financial Node (uses kit; conversions + discrepancy)

```ts
// nodes/financial.ts
import { RunnableLambda } from "@langchain/core/runnables";
import { FinancialExtract, normalizeWithLLM } from "../normalization/kit";

function toMonthly(incomeInput: string | number, period?: string): number {
  const val = typeof incomeInput === "string" ? parseFloat(incomeInput.replace(/[^\d.]/g,"")) : incomeInput;
  switch (period) {
    case "hourly":   return val * 40 * 52 / 12;
    case "weekly":   return val * 52 / 12;
    case "biweekly": return val * 26 / 12;
    case "annual":   return val / 12;
    default:         return val; // already monthly
  }
}

export const financialNode = RunnableLambda.from(async ({ state }) => {
  const { parsed } = await normalizeWithLLM({
    text: /* conversation text */,
    schema: FinancialExtract,
    systemHint: "Extract income and tenure; if income includes a period (hourly/annual), capture it."
  });

  const monthlyIncome = Math.round(toMonthly(parsed.incomeInput, parsed.incomePeriod));
  const jobTenureMonths = parsed.jobTenureMonths;

  // Discrepancy follow-up (if app value available in context; optional)
  // if (appMonths && Math.abs(jobTenureMonths - appMonths) >= 3) { ... }

  return {
    collected: { financial: { monthlyIncome, jobTenureMonths } },
    needs: { identity: false, contact: false, financial: false, confirm: true }
  };
});
```

### Confirmation & Termination Nodes

- **Confirmation**: TTS-friendly summary; ask for final confirmation (`yes/no`).
- **Termination**: deliver exact scope script; write an audit event (`attempts`, `reason`), no PII.

---

## Identity DB Boundary (PII-safe)

```ts
// integrations/identity-db.ts
import { Pool } from "pg";
import crypto from "crypto";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const SSN_SALT = process.env.SSN_SALT || "change-me";
const DOB_SALT = process.env.DOB_SALT || "change-me";

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
const hashLast4Local = (last4: string) => sha256(last4 + SSN_SALT);
const hashDOBLocal = (dobIso: string) => sha256(dobIso + DOB_SALT);

export async function verifyIdentityFromDB(req: {
  dob: string; ssnLast4: string; externalRef?: string;
}): Promise<{ verified: boolean; reason?: 'DOB_MISMATCH'|'SSN_MISMATCH'|'NOT_FOUND'|'SYSTEM_ERROR' }> {
  try {
    const ssnHash = hashLast4Local(req.ssnLast4);
    const dobHash = hashDOBLocal(req.dob);

    if (req.externalRef) {
      const { rows } = await pool.query(
        `SELECT dob_hash, ssn4_hash FROM identity_records WHERE external_ref = $1 LIMIT 1`,
        [req.externalRef]
      );
      if (!rows[0]) return { verified: false, reason: "NOT_FOUND" };
      const dobOk = rows[0].dob_hash === dobHash;
      const ssnOk = rows[0].ssn4_hash === ssnHash;
      return dobOk && ssnOk
        ? { verified: true }
        : { verified: false, reason: dobOk ? "SSN_MISMATCH" : ssnOk ? "DOB_MISMATCH" : "NOT_FOUND" };
    } else {
      const { rows } = await pool.query(
        `SELECT 1 FROM identity_records WHERE dob_hash = $1 AND ssn4_hash = $2 LIMIT 1`,
        [dobHash, ssnHash]
      );
      return rows[0] ? { verified: true } : { verified: false, reason: "NOT_FOUND" };
    }
  } catch {
    return { verified: false, reason: "SYSTEM_ERROR" };
  }
}
```

**Identity table (hashed PII only):**

```sql
CREATE TABLE IF NOT EXISTS identity_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref TEXT UNIQUE,
  dob_hash TEXT NOT NULL,
  ssn4_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_identity_records_ref ON identity_records (external_ref);
CREATE INDEX IF NOT EXISTS idx_identity_records_combo ON identity_records (dob_hash, ssn4_hash);
```

---

## Voice Optimization (Utilities)

```ts
export const spellDigits = (s: string) => s.split("").join("-");
export const spellEmail = (e: string) => e.replace(/@/g," at ").replace(/\./g," dot ").split("").join("-");
export const sayDate = (iso: string) => /* "March fifteenth, nineteen eighty-five" */;
export const sayMoney = (n: number) => /* "six thousand five hundred dollars" */;
export const sayZip = (zip: string) => zip.replace(/./g, (c, i) => (i ? "-" : "") + c);
```

---

## Security & Compliance

- **Gatekeeping**: identity check controls access; nodes refuse to run without prerequisites.
- **No raw PII** in logs, state, or DB (DOB/SSN always hashed in state and DB).
- **Redaction**: DOB → `****-**-**`, SSN4 → `****`, email masked in events.
- **Structured audit** with `session_id`, `user_id`, `node`, `attempt_number`, `success`, `reason`.

**Audit tables (minimal):**

```sql
CREATE TABLE conversation_sessions (
  id UUID PRIMARY KEY,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE verification_attempts (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES conversation_sessions(id),
  user_id TEXT,
  node TEXT NOT NULL,                         -- "identity"
  attempt_number INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  reason VARCHAR(40),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Testing Requirements (Scope)

- **Golden scenarios**:

  1. Successful verification
  2. Identity verification failure (2x) → terminate
  3. Job tenure discrepancy (downstream)
  4. Self-employed (downstream)
  5. Address clarification (unit number)
  6. Partial fail → success (identity recovery)

- **Assertions**:

  - Identity gate blocks downstream until success.
  - Two failures trigger professional termination script.
  - Voice formatting: digits/dates/money/email.
  - DB boundary returns only boolean/enum; no PII surfaced.
  - Logs include `session_id`, `user_id`, `node`, attempts, reason; always redacted.

Example:

```ts
test("successful_verification", async () => {
  const result = await replayConversation("successful_verification.json");
  expect(result.nodes).toEqual(["identity","contact","financial","confirm"]);
  expect(result.final.identityVerified).toBe(true);
});
```

---

## Code Style & Patterns

- **TypeScript** strict mode.
- **LLM JSON mode + Zod** for all extraction/normalization (via Normalization Kit).
- **Small pure utilities** for formatting & conversions.
- **Graceful errors** → global `onError` → terminate (fail-closed).
- **Lightweight Intent Parser** for slot detection/clarifications.

---

## Integration Points

- **LLM**: OpenAI/Anthropic (JSON structured outputs).
- **DB**: Postgres (LangGraph checkpointer + `identity_records` + audit).
- **Logging/Monitoring**: structured logs (redacted), counters on attempts/failures.
- **Redis (optional)**: rate-limit identity attempts per session/user.

---

## Implementation Roadmap

**Phase 1 — MVP**

1. State schema + reducers (capability flags).
2. Nodes: identity, contact, financial, confirm, terminate.
3. Normalization Kit (LLM+Zod) + JSON mode utility.
4. Checkpointer + edges + global error routing.
5. Identity DB boundary + audit events.
6. Golden tests for the 6 scope scenarios.
7. TTS utilities (digits/dates/money/email, zip).
8. Unit number single-prompt logic; email spelling confirmation.
9. Clarification & confirmation loops.
10. Rate limiting for identity attempts.
11. Additional validators + semantic checks (e.g., DOB ≥ 18y).
12. Latency metrics & health endpoints.

---

## Professional Termination Script (Scope-Exact)

> “I understand this can be frustrating. However, the last four digits of your Social Security Number and date of birth are required to proceed with the verification. Since we're unable to verify this information today, I'll need to conclude our call. Thank you for your time, and please feel free to call back when you have this information available.”

---


## Completion Criteria (atomic)

This release is complete when all of the following are true:

Identity Node (hard gate)

  [ ] Extracts & normalizes { dob, ssnLast4, externalRef? } using Normalization Kit (LLM+Zod).

  [ ]  Hashes dob → dobHash and ssnLast4 → ssnLast4Hash before any persistence.

  [ ]  Verifies via DB boundary returning only { verified, reason } (no PII).

  [ ]  Increments attempts deterministically (exactly once per cycle) and:

  [ ]  verified===true → identityVerified=true, routes to contact.

  [ ]  verified===false with attempts < 2 → loops to identity.

  [ ]  attempts >= 2 → routes to terminate and uses the exact script.

  [ ]  Emits redacted telemetry: session_id, user_id, node, attempt_number, success, reason, DOB ****-**-**, SSN ****.

[ ] Contact Node

  [ ]  Normalizes address (street/city/state/zip + optional unit) via kit.

  [ ]  Unit prompt executed at most once when likely multi-unit & unit missing.

  [ ]  Optional email normalized (lowercased/trimmed) and supports spelling confirmation.

  [ ]  On success: needs.financial=true, progress flags updated.

[ ] Financial Node

  [ ]  Normalizes income + period via kit and converts to monthly.

  [ ]   Captures jobTenureMonths; compares against threshold; sets clarification hint if discrepancy logic is in scope.

  [ ]   On success: needs.confirm=true.

[ ] Confirmation & Termination

 [ ]  Confirmation node produces TTS-ready summary and requires final user confirmation.

 [ ]   Termination node logs a non-PII audit event and delivers the scope-approved script.

[ ] Normalization Kit

  [ ]  Provides reusable schemas (IdentityExtract, AddressExtract, EmailExtract, FinancialExtract).

  [ ]  Wraps LLM JSON-mode with retries and validates with Zod.

  [ ]  Unit tests cover happy/invalid paths (Zod rejections surfaced cleanly).

[ ] State, Graph & Persistence

  [ ]  State uses annotations + reducers (no phase enums).

  [ ]  Conditional edges exactly match the routing rules above.

  [ ]  ostgres checkpointer persists all transitions keyed by session/thread id.

[ ] Database & Migrations

  [ ]  identity_records stores only hashes (dob_hash, ssn4_hash) with required indexes.

  [ ]  Migrations applied and reversible.

  [ ]  Boundary queries use parameters; timeouts respected.

[ ] Security & Logging

  [ ]  No raw DOB/SSN appear in logs, state, or DB.

  [ ]  All audit/attempt events are redacted and include correlation fields.

  [ ]  Secrets provided via env (DATABASE_URL, SSN_SALT, DOB_SALT), unique per environment.

[ ] Tests & Quality Gates

  [ ]  Golden scenarios (6) pass end-to-end with deterministic routes.

  [ ]  Unit + integration tests cover success, fail→retry→success, fail→fail→terminate.

  [ ]  Concurrency test shows session isolation; attempt counters never cross sessions.

  [ ]  Lint, type-check, and build all pass.

[ ] Performance & Reliability

  [ ]  Identity verification completes within IDENTITY_TIMEOUT_MS (default 5000ms).

  [ ]   No unbounded memory growth during soak (e.g., 1k parallel sessions, 15 min).

  [ ]  (Optional) Rate-limit path is feature-flagged and tested when enabled.

### Done

This architecture:

- Keeps **normalization inside each node** (identity/contact/financial) using a **shared LLM+Zod kit**,
- Preserves the **hard identity gate** and **least-privilege** access,
- Remains fully **within scope** while raising quality, security, and testability.
