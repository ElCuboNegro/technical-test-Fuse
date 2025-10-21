# Financial Information Node — **Design (LangChain / LangGraph Explicit)**  

**Version:** 1.3  
**Status:** Stable Draft  
**Aligned With:** Voice Verification Agent — Final System Architecture (Scoped)

---

## 1) Overview

The **Financial Information Node** is a LangGraph node (implemented as a `RunnableLambda`) that runs **after Contact Information** and collects a user’s **monthly income (pre-tax)** and **job tenure (months)**.

This node **owns extraction + normalization**:

- Uses **LangChain** with **Zod-enforced JSON** output to extract structure from free text.
- Converts **hourly/weekly/biweekly/annual → monthly** deterministically.
- Normalizes **tenure → months** with ambiguity detection and a clarification loop.
- Validates ranges; detects **tenure discrepancy** vs `state.thresholds.jobTenureMinMonths`.
- On success, updates state and **routes to Confirmation**.

Security: Financial data is treated as PII-lite (sensitive). Redacted telemetry only; no raw utterances persisted.

---

## 2) LangChain / LangGraph Integration

**Where each piece lives:**

- **LangGraph**  
  - `StateGraph` orchestration and conditional edges.  
  - `RunnableLambda` node `financial`.  
  - Postgres **checkpointer** persists state deltas.

- **LangChain**  
  - LLM invocation in **JSON mode** with Zod via `JsonOutputParser`.  
  - Chains composed with `RunnableSequence` (`PromptTemplate -> Chat Model -> Parser`).  
  - Node uses a shared **Normalization Kit** helper or explicit chain (both shown).

### Sequence Overview

```mermaid
graph TD
  A[Contact Node] --> B[Financial Node (RunnableLambda)]
  subgraph LangChain Chain
    P[PromptTemplate] --> M[(Chat Model)]
    M --> R[[JsonOutputParser (Zod)]]
  end
  B -->|invoke| P
  R -->|parsed JSON| B
  B -->|state update| G[LangGraph State + Checkpointer]
  B -->|flags| E{Edges}
  E -->|complete| C[Confirmation Node]
  E -->|retry| B
  E -->|error| T[Termination Node]
````

---

## 3) Responsibilities (Single Node Ownership)

| Area          | Responsibility                                                                        |
| ------------- | ------------------------------------------------------------------------------------- |
| Extraction    | Parse `incomeInput`, `incomePeriod`, and `jobTenure` from utterance (LLM + Zod JSON). |
| Normalization | Convert income period → monthly; tenure → integer months.                             |
| Validation    | Check bounds and reasonableness (income, tenure).                                     |
| Discrepancy   | If tenure below threshold (or mismatch vs app data if present), trigger empathy path. |
| State Mgmt    | Update `state.collected.financial`, `needs`, `financialProgress`.                     |
| Telemetry     | Emit **redacted** financial events for audit/metrics.                                 |
| Security      | Sanitize inputs; avoid raw utterances in persistence; redact telemetry fields.        |

---

## 4) State Contract (read/write)

```ts
// Read prerequisites (set by previous nodes)
state.identityVerified === true
state.collected.contact is complete

// Writes (reducers merge atomically)
collected: {
  financial: {
    monthlyIncome: number;     // integer/float; monthly, pre-tax
    jobTenureMonths: number;   // integer months
  }
}
needs: { identity: false; contact: false; financial: false; confirm: true }

financialProgress: {
  incomeComplete: boolean;
  tenureComplete: boolean;
  discrepancyHandled: boolean; // empathy asked once; prevents loops
}

// Thresholds (defaults from system/state)
thresholds: { jobTenureMinMonths: number } // e.g., 15
```

---

## 5) Schemas (Zod)

```ts
import { z } from "zod";

export const FinancialExtract = z.object({
  // free text or numeric; we normalize later
  incomeInput: z.union([z.string(), z.number()]),
  // optional period; may need inference from text (LLM prompt guides it)
  incomePeriod: z.enum(["hourly", "weekly", "biweekly", "monthly", "annual"]).optional(),
  // free text or numeric (e.g., "2 years 3 months", "18 months", 24)
  jobTenure: z.union([z.string(), z.number()])
});

export type TFinancialExtract = z.infer<typeof FinancialExtract>;
```

---

## 6) LangChain Chain (Explicit Composition)

You may use the shared normalization helper **or** inline composition (shown here for clarity).

```ts
import { RunnableSequence } from "@langchain/core/runnables";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { ChatOpenAI } from "@langchain/openai";
import { FinancialExtract } from "./schemas";

const model = new ChatOpenAI({
  modelName: "gpt-4o-mini", // or Anthropic equivalent via @langchain/anthropic
  temperature: 0
});

const parser = new JsonOutputParser<ReturnType<typeof FinancialExtract.parse>>({
  schema: FinancialExtract
});

const prompt = ChatPromptTemplate.fromMessages([
  ["system",
   "You extract financial fields in JSON only. " +
   "Return strictly valid JSON matching this schema: " +
   "{ incomeInput: string|number, incomePeriod?: 'hourly'|'weekly'|'biweekly'|'monthly'|'annual', jobTenure: string|number }. " +
   "If ambiguous, choose best-guess and prefer explicit periods."],
  ["human", "Extract fields from this message:\n\n{user_text}"]
]);

export const financialChain = RunnableSequence.from([
  prompt,
  model,
  parser
]);

// Usage:
// const parsed = await financialChain.invoke({ user_text: inputText });
```

> **Note:** If you have a shared `normalizeWithLLM()` wrapper, it should internally compose the same `PromptTemplate -> Model -> Parser` sequence.

---

## 7) Deterministic Normalization & Validation

```ts
// Normalization constants (configurable)
const HOURS_PER_WEEK = Number(process.env.HOURS_PER_WEEK ?? 40);
const WEEKS_PER_YEAR = Number(process.env.WEEKS_PER_YEAR ?? 52);

// Convert period → monthly
export function convertToMonthly(amount: number, period?: "hourly"|"weekly"|"biweekly"|"monthly"|"annual"): number {
  if (Number.isNaN(amount)) return NaN;
  switch (period) {
    case "hourly":   return (amount * HOURS_PER_WEEK * WEEKS_PER_YEAR) / 12;
    case "weekly":   return (amount * 52) / 12;
    case "biweekly": return (amount * 26) / 12;
    case "annual":   return amount / 12;
    case "monthly":
    default:         return amount;
  }
}

// Tenure → integer months (handles “2 years”, “18 months”, “about 3 years”)
export function convertTenureToMonths(input: string | number): number {
  if (typeof input === "number") return Math.round(input);
  const years = parseFloat((input.match(/(\d+(?:\.\d+)?)\s*years?/) || [])[1] ?? "0");
  const months = parseFloat((input.match(/(\d+)\s*months?/) || [])[1] ?? "0");
  return Math.round(years * 12 + months);
}

// Validation ranges (policy)
export function validateIncome(monthly: number): boolean {
  return Number.isFinite(monthly) && monthly >= 0 && monthly <= 50000;
}
export function validateTenure(months: number): boolean {
  return Number.isFinite(months) && months >= 0 && months <= 600;
}
```

---

## 8) Node Implementation (LangGraph RunnableLambda)

```ts
// nodes/financial.ts
import { RunnableLambda } from "@langchain/core/runnables";
import { financialChain } from "../chains/financial";
import {
  convertToMonthly, validateIncome,
  convertTenureToMonths, validateTenure
} from "../utils/financial-normalization";
import { redactFinancialPII } from "../security/redaction";

type NodeCtx = { state: any; config?: any };

export const financialNode = RunnableLambda.from(async ({ state, config }: NodeCtx) => {
  // 0) Prereqs (no bypass)
  if (!state.identityVerified || !state.collected?.contact) {
    return { lastError: { code: "PREREQUISITES_NOT_MET", recoverable: false } };
  }

  // 1) Extract with LangChain (LLM JSON + Zod)
  const inputText = config?.inputText ?? state?.lastUserMessage ?? "";
  const parsed = await financialChain.invoke({ user_text: inputText });

  // 2) Normalize deterministically
  const rawAmount = typeof parsed.incomeInput === "string"
    ? Number(parsed.incomeInput.replace(/[^\d.]/g, ""))
    : Number(parsed.incomeInput);

  const monthlyIncome = convertToMonthly(rawAmount, parsed.incomePeriod);
  const jobTenureMonths = convertTenureToMonths(parsed.jobTenure);

  // 3) Validate
  if (!validateIncome(monthlyIncome)) {
    config?.callbacks?.onEvent?.({
      type: "financial_attempt",
      data: { success: false, reason: "INVALID_INCOME", redactions: { income_bucket: redactFinancialPII(monthlyIncome) } }
    });
    return { needs: { ...state.needs, financial: true },
             lastError: { code: "INVALID_INCOME", recoverable: true } };
  }

  if (!validateTenure(jobTenureMonths)) {
    config?.callbacks?.onEvent?.({
      type: "financial_attempt",
      data: { success: false, reason: "INVALID_TENURE", redactions: { tenure_range: redactFinancialPII(jobTenureMonths, "tenure") } }
    });
    return { needs: { ...state.needs, financial: true },
             lastError: { code: "INVALID_TENURE", recoverable: true } };
  }

  // 4) Discrepancy handling (soft gate, empathy once)
  const minThreshold = state.thresholds?.jobTenureMinMonths ?? 15;
  const discrepancy = Math.abs(jobTenureMonths - minThreshold);

  if (discrepancy >= 3 && !state.financialProgress?.discrepancyHandled) {
    // Ask empathy script upstream (voice layer)
    config?.callbacks?.onPrompt?.("TENURE_DISCREPANCY_EMPATHY");
    return {
      needs: { ...state.needs, financial: true },
      financialProgress: { ...(state.financialProgress ?? {}), discrepancyHandled: true }
    };
  }

  // 5) Telemetry (redacted)
  config?.callbacks?.onEvent?.({
    type: "financial_collected",
    data: {
      incomeComplete: true,
      tenureComplete: true,
      redactions: {
        income_bucket: redactFinancialPII(monthlyIncome),
        tenure_range: redactFinancialPII(jobTenureMonths, "tenure")
      }
    }
  });

  // 6) State update (idempotent)
  return {
    collected: {
      ...state.collected,
      financial: { monthlyIncome, jobTenureMonths }
    },
    needs: { identity: false, contact: false, financial: false, confirm: true },
    financialProgress: {
      ...(state.financialProgress ?? {}),
      incomeComplete: true,
      tenureComplete: true,
      discrepancyHandled: true
    }
  };
});
```

---

## 9) Routing (Graph Edges)

From `financial`:

- ✅ **complete** → `confirm`
- 🔁 **retry** (validation, ambiguity, or empathy pass) → `financial`
- ⚠️ **system error** (via `onError`) → `terminate` with professional script

No hard attempt count here; progress flags prevent loops (e.g., empathy shown once).

---

## 10) Voice / TTS Integration

- **Format income** for read-back: “six thousand five hundred dollars”.
- **Format tenure**: “two years and three months”.
- **Empathy/clarification** (tenure discrepancy) — use approved script:

  > “I show on your application that you've been employed for **X** months. Can you help me understand the difference?”

> Voice templates are orchestrated by the conversation layer; this node sets flags and emits `onPrompt` cues for specific scripts.

---

## 11) Security & Telemetry

- **Never log raw utterances or raw extracted values.**
  Bucket or range all telemetry:

  - `income_bucket`: `"<5k" | "5–10k" | ">10k"` (example policy)
  - `tenure_range`: `"<12m" | "12–24m" | ">24m"`
- **Encrypted persistence**: `monthly_income`, `job_tenure_months` columns encrypted at rest (PG crypto or KMS-backed).
- **PII redaction** middleware on all logs and LangChain callbacks.

Example event:

```json
{
  "node": "financial",
  "session_id": "abc",
  "success": true,
  "redacted_fields": { "income_bucket": "5–10k", "tenure_range": ">24m" },
  "ts": "2025-10-21T10:00:00Z"
}
```

---

## 12) Testing Strategy (Deterministic)

**Unit**

- `convertToMonthly(hourly|weekly|biweekly|annual|monthly)` returns expected monthly values (±1%).
- `convertTenureToMonths('2 years 3 months' | 18 | 'about 3 years')` → 27 | 18 | 36.
- Validation rejects income > 50,000 and tenure > 600 or < 0.
- Redaction functions return buckets/ranges, never raw numbers.

**Integration (Node)**

- **Happy path**: contact complete → extract → normalize → confirm flags set.
- **Income invalid → retry**: returns `needs.financial=true`, `lastError=INVALID_INCOME`.
- **Tenure invalid → retry**: returns `needs.financial=true`, `lastError=INVALID_TENURE`.
- **Discrepancy once**: first pass sets `discrepancyHandled=true` and re-prompts; second pass proceeds.
- **Telemetry**: events are emitted with redacted fields only.
- **Idempotency**: re-invoking node with same inputs doesn’t double-write progress.

**Voice/TTS**

- Formatters produce human-friendly strings (money, tenure).
- Empathy prompt triggered exactly once when discrepancy condition met.

**Security**

- No raw values in logs (assert with log capture).
- Encrypted storage configuration baked into DB layer (migrations checked).

---

## 13) Completion Criteria (Atomic)

This node is **complete** when:

- [ ] Extraction via **LangChain chain** (Prompt → Model → `JsonOutputParser`) is deterministic and schema-valid.
- [ ] Income & tenure are normalized and **validated** with policy bounds.
- [ ] **Discrepancy** flow prompts empathy exactly once, then proceeds.
- [ ] State reducers: `collected.financial` written, `needs.confirm=true`, progress flags set.
- [ ] Telemetry is **redacted**; no raw financial values logged or persisted outside encrypted columns.
- [ ] Integration tests pass (`npm test -- --testPathPattern=financial`) with golden scenarios.
- [ ] Build + types clean (`npm run build && npm run type-check`).
- [ ] Code reviewed for **idempotency**, **security**, and **LangGraph** correctness.

---

## 14) Implementation Notes

- Prefer a **shared `normalizeWithLLM()` helper** that builds the exact chain shown above; reuse across nodes for consistency.
- Keep the **model temperature at 0** for deterministic JSON output.
- Use **LangGraph Postgres checkpointer** to persist state transitions; couple node telemetry with `session_id`.
- All retries are **soft** (no hard limit); progress flags prevent infinite loops.

---
