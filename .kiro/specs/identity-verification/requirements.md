# Identity Verification Node — Simplified Spec (DB-Backed, Scoped)

## 1) Purpose

A **hard security gate** that collects and verifies **DOB** and **SSN last-4** at the start of the conversation **against your database**. On success it unlocks the next step; on failure (after limited attempts) it **terminates professionally**. All PII is handled securely and voice responses are TTS-friendly.

## 2) Definitions (minimal)

* **Identity node**: LangGraph node that extracts and verifies DOB + SSN4.
* **Verification state**: Shared graph state (annotations + reducers).
* **Identity DB boundary**: DB lookup that returns only a boolean/enum result (no PII returned to the node). Optionally scoped by `externalRef` (e.g., application_id).
* **PII**: DOB, SSN data, address/email (do not log raw values).

## 3) Inputs & Outputs

### Inputs (from graph/state)

* User utterance (text from upstream layer).
* `state.attempts.identity` (number).
* Optional `externalRef` (e.g., application ID) to scope the DB check.
* Config callbacks for logging/telemetry.

### Outputs (state deltas)

* **On success:**

  * `identityVerified = true`
  * `collected.identity = { dob, ssnLast4Hash }`
  * `needs = { identity:false, contact:true, financial:false, confirm:false }`
  * `attempts.identity = attempts + 1`
* **On failure (attempt < 2):**

  * `identityVerified = false`
  * `needs.identity = true`
  * `attempts.identity = attempts + 1`
* **On failure (attempt == 2):** route to **terminate** via conditional edge.

## 4) Functional Requirements

### R1 — Collection & Verification

* Collect DOB (**month, day, year**) and **SSN last-4** via **structured extraction** (JSON schema).
* Verify against **Identity DB boundary** (boolean/enum only; no PII returned).
* On success, set `identityVerified = true` and enable next step (contact).

**Acceptance**

1. Collect DOB (M/D/YYYY spoken; ISO stored).
2. Collect SSN last-4 (spoken digits; stored as hash).
3. Verify against DB; boolean result drives routing.
4. Success updates state and enables contact step.

### R2 — Attempts & Termination

* Max **2** attempts.
* After 2 failures, **terminate** with the approved script (verbatim).

**Acceptance**

1. Failure increments `attempts.identity`.
2. At `attempts.identity >= 2` → route to termination node.
3. Use **exact termination script** provided in scope.
4. No bypass of identity gate.

### R3 — Security & PII

* **Hash SSN last-4 at ingress**; never persist or log raw digits.
* Redact PII in all logs/traces; sanitize inputs before use.

**Acceptance**

1. Raw SSN last-4 never appears in state, logs, or DB writes from the node.
2. DOB redacted in logs (e.g., `****-**-**`).
3. Only hashed SSN4 is stored in state; DB stores only hashed SSN4 (and either DOB or DOB hash per your policy).
4. All inputs validated/sanitized.

### R4 — Voice/TTS

* Prompts/confirmations are **TTS-optimized**:

  * Digits **spelled** (“7-2-3-4”).
  * Date in **full words** (“March fifteenth, nineteen eighty-five”).
* Empathetic, **professional** feedback on failure.
* Short confirmation loops to avoid mishearing.

**Acceptance**

1. Requests communicate the expected format.
2. Confirmation repeats digits and date in TTS-friendly form.
3. Failure lines remain professional and concise.

### R5 — LangGraph Integration

* Node is **idempotent** and updates state via **reducers**.
* Routing via **conditional edges** (identity → contact | identity | terminate).
* Errors bubble to global `onError` → termination path.
* State persisted using **checkpointer**.

**Acceptance**

1. Uses annotations/reducers (no phase enums).
2. Conditional edges match outcomes.
3. Checkpointer persists state transitions.

### R6 — Testing

* Unit tests for success/failure and hashing/redaction.
* Integration tests for **DB boundary** and routing.
* Voice formatting assertions (digits/date).

**Acceptance**

1. Golden tests for: success, two failures, fail→success.
2. Security tests confirm **no raw PII**.
3. All tests pass and TS builds clean.

## 5) Node Contract (concise code)

```ts
// nodes/identity.ts (contract skeleton)
import { RunnableLambda } from "@langchain/core/runnables";
import { z } from "zod";
import { hashLast4 } from "../security/crypto";
import { verifyIdentityFromDB } from "../integrations/identity-db";
import { redactPII } from "../security/redaction";

const Extract = z.object({
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),   // ISO in state
  ssnLast4: z.string().regex(/^\d{4}$/),
  externalRef: z.string().optional()              // optional scoping key
});

export const identityNode = RunnableLambda.from(async ({ state, config }) => {
  // 1) Extract via JSON schema (LLM/tool)
  const { dob, ssnLast4, externalRef } = await extractWithSchema(Extract); // implementation detail

  // 2) Verify via DB boundary (boolean/enum only)
  const { verified, reason } = await verifyIdentityFromDB({ dob, ssnLast4, externalRef });
  const attempts = state.attempts.identity + 1;

  // 3) Telemetry (redacted)
  config?.callbacks?.onEvent?.({
    type: "identity_attempt",
    data: { success: verified, attempts, reason, dob: redactPII(dob), ssnLast4: "****" }
  });

  // 4) State update
  if (!verified) {
    return {
      attempts: { identity: attempts },
      identityVerified: false,
      needs: { ...state.needs, identity: true } // router will loop until max attempts
    };
  }

  return {
    attempts: { identity: attempts },
    identityVerified: true,
    collected: { identity: { dob, ssnLast4Hash: hashLast4(ssnLast4) } },
    needs: { identity: false, contact: true, financial: false, confirm: false }
  };
});
```

## 6) Routing (graph edges)

* From `identity`:

  * if `identityVerified === true` → `contact`
  * else if `attempts.identity >= 2` → `terminate`
  * else → `identity` (retry loop)

*(Defined in the graph; not inside the node.)*

## 7) Voice Prompts (examples)

* Request DOB:
  “For security, please say your **date of birth** with **month, day, and year**—for example, **March fifteenth, nineteen eighty-five**.”
* Request SSN4:
  “Please say the **last four digits** of your Social Security Number. I’ll **repeat them digit by digit**.”
* Confirm:
  “I have your date of birth as **March fifteenth, nineteen eighty-five**, and the last four digits as **7-9-4-8**. Is that correct?”
* Failure (first try):
  “I couldn’t verify that. Let’s try once more.”
* **Termination (second failure):** *(verbatim as per scope)*

  > “I understand this can be frustrating. However, the last four digits of your Social Security Number and date of birth are required to proceed with the verification. Since we're unable to verify this information today, I'll need to conclude our call. Thank you for your time, and please feel free to call back when you have this information available.”

## 8) Security Utilities (identity-specific)

```ts
// security/crypto.ts
import crypto from "crypto";
export function hashLast4(ssnLast4: string): string {
  if (!/^\d{4}$/.test(ssnLast4)) throw new Error("SSN last 4 must be 4 digits");
  const salt = process.env.SSN_SALT || "change-me";
  return crypto.createHash("sha256").update(ssnLast4 + salt).digest("hex");
}
```

```ts
// security/redaction.ts
export function redactPII(value?: string): string | undefined {
  if (!value) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return "****-**-**"; // DOB ISO
  if (/^\d{4}$/.test(value)) return "****";                   // SSN4
  return value;
}
```

```ts
// integrations/identity-db.ts
import { Pool } from "pg";
import crypto from "crypto";

const SALT = process.env.SSN_SALT || "change-me";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function hashLast4Local(ssnLast4: string): string {
  if (!/^\d{4}$/.test(ssnLast4)) throw new Error("SSN last 4 must be 4 digits");
  return crypto.createHash("sha256").update(ssnLast4 + SALT).digest("hex");
}

/** DB verification with optional scoping via externalRef */
export async function verifyIdentityFromDB(req: {
  dob: string; ssnLast4: string; externalRef?: string;
}): Promise<{ verified: boolean; reason?: 'DOB_MISMATCH'|'SSN_MISMATCH'|'NOT_FOUND'|'SYSTEM_ERROR' }> {
  try {
    const ssnHash = hashLast4Local(req.ssnLast4);

    if (req.externalRef) {
      const { rows } = await pool.query(
        `SELECT dob, ssn4_hash FROM identity_records WHERE external_ref = $1 LIMIT 1`,
        [req.externalRef]
      );
      if (!rows[0]) return { verified: false, reason: 'NOT_FOUND' };
      const dobOk = rows[0].dob?.toISOString?.().slice(0,10) === req.dob;
      const ssnOk = rows[0].ssn4_hash === ssnHash;
      if (dobOk && ssnOk) return { verified: true };
      return { verified: false, reason: dobOk ? 'SSN_MISMATCH' : ssnOk ? 'DOB_MISMATCH' : 'NOT_FOUND' };
    } else {
      const { rows } = await pool.query(
        `SELECT 1 FROM identity_records WHERE dob = $1 AND ssn4_hash = $2 LIMIT 1`,
        [req.dob, ssnHash]
      );
      return rows[0] ? { verified: true } : { verified: false, reason: 'NOT_FOUND' };
    }
  } catch {
    return { verified: false, reason: 'SYSTEM_ERROR' }; // fail-closed
  }
}
```

### (Optional) DB Table & Seeding (for dummy data/testing)

```sql
CREATE TABLE IF NOT EXISTS identity_records (
  id UUID PRIMARY KEY,
  external_ref TEXT UNIQUE,
  dob DATE NOT NULL,
  ssn4_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_identity_records_ref ON identity_records (external_ref);
```

```ts
// scripts/seed-identity.ts
import { Pool } from "pg";
import crypto from "crypto";
const SALT = process.env.SSN_SALT || "change-me";
const hash = (s:string) => crypto.createHash("sha256").update(s + SALT).digest("hex");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(`
  INSERT INTO identity_records (id, external_ref, dob, ssn4_hash)
  VALUES 
    (gen_random_uuid(), 'app_001', '1985-03-15', $1),
    (gen_random_uuid(), 'app_002', '1990-06-22', $2)
  ON CONFLICT (external_ref) DO NOTHING;
`, [hash("7948"), hash("8492")]);
await pool.end();
```

## 9) Tests (lean & scoped)

### Unit

* Success on first attempt → `identityVerified=true`, `needs.contact=true`, hash stored.
* Failure increments attempts and keeps `needs.identity=true`.
* Second failure leads the **graph** to termination via edge condition.
* Hashing and redaction behave as specified.

### Integration (DB)

* Seed dummy row (e.g., `app_001`, `1985-03-15`, `7948` hashed).
* **Success**: `dob=1985-03-15`, `ssn4=7948` → verified → `needs.contact=true`.
* **Fail→retry→terminate**: wrong SSN twice → attempts hit 2 → termination edge.
* **Partial fail then success**: wrong → correct → proceeds.

### Voice formatting

* SSN read back as **spelled digits**.
* DOB read back in **full words**.

*(Keep golden scenarios for: success, fail→retry→success, fail→fail→terminate.)*

## 10) Completion Criteria (atomic)

**This unit is complete when:**

* [ ] Identity extraction works with JSON schema validation
* [ ] SSN hashing occurs before any persistence
* [ ] **DB verification boundary** is properly isolated
* [ ] Attempt tracking increments correctly
* [ ] Professional termination triggers after 2 attempts
* [ ] All PII is redacted from logs and events
* [ ] Unit tests pass for all success/failure scenarios
* [ ] Security tests verify no PII leakage
* [ ] Integration tests confirm end-to-end DB flow
* [ ] Build compiles without errors

### Success Validation

```bash
# Run tests for this atomic unit only
npm test -- --testPathPattern=identity

# Verify build compiles
npm run build

# Check TypeScript types
npm run type-check
```
