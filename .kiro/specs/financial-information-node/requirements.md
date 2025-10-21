# Financial Information Node — Simplified Spec (LangChain/LangGraph, Scoped)

## 1) Purpose

A **financial collection gate** that runs **after contact information** and gathers a user’s:
- **Monthly income (pre-tax)** — normalized from hourly/weekly/biweekly/annual inputs
- **Job tenure (months)** — normalized from natural language (e.g., “2 years 3 months”)

On success it **unlocks the confirmation step**. The node owns **extraction + normalization** (via LLM+Zod) and performs deterministic validation and a **soft discrepancy clarification** (tenure vs policy threshold). All outputs are voice/TTS-friendly, telemetry is **redacted**, and state is persisted via the LangGraph checkpointer.

---

## 2) Definitions (minimal)

- **Financial node**: LangGraph node that extracts, normalizes, validates, and persists monthly income and job tenure.
- **LLM Normalization**: LangChain JSON-mode extraction enforced by **Zod** schemas.
- **Discrepancy clarification**: Single empathy/clarification prompt when tenure diverges from policy threshold.
- **Financial PII (sensitive)**: Income and tenure values; never log raw numbers—emit **bucketed** telemetry only.

---

## 3) Inputs & Outputs

### Inputs (from graph/state)
- `state.identityVerified === true`
- `state.collected.contact` is complete
- `state.thresholds.jobTenureMinMonths` (default: 15)
- Conversation text for this turn (provided through `config.inputText` or upstream message)
- Config callbacks for prompts/telemetry (`onPrompt`, `onEvent`)

### Outputs (state deltas)

**On success**
- `collected.financial = { monthlyIncome: number, jobTenureMonths: number }`
- `needs = { identity:false, contact:false, financial:false, confirm:true }`
- `financialProgress = { incomeComplete:true, tenureComplete:true, discrepancyHandled:true }`

**On retry/incomplete**
- `needs.financial = true`
- `lastError = { code: "...", recoverable:true }`
- `financialProgress` updated (e.g., `discrepancyHandled:true` after empathy prompt)

**On hard prereq failure**
- `lastError = { code:"PREREQUISITES_NOT_MET", recoverable:false }` (router may terminate)

---

## 4) Functional Requirements

### R1 — LLM Extraction (JSON + Zod)
- Use LangChain with **Zod schema** to extract:
  - `incomeInput: string|number`
  - `incomePeriod?: "hourly"|"weekly"|"biweekly"|"monthly"|"annual"`
  - `jobTenure: string|number`
- Parser must **strictly validate** JSON; non-conformant outputs → retry path.

**Acceptance**
1. Non-JSON/invalid JSON → recoverable error; `needs.financial=true`.
2. Parsed object matches Zod schema exactly.

---

### R2 — Deterministic Normalization
- Convert income to **monthly** using policy constants:
  - `hourly`: `amount * HOURS_PER_WEEK * WEEKS_PER_YEAR / 12`
  - `weekly`: `amount * 52 / 12`
  - `biweekly`: `amount * 26 / 12`
  - `annual`: `amount / 12`
  - `monthly`: `amount`
- Convert tenure to **integer months** from either numeric months or “X years Y months”.

**Acceptance**
1. “$25/hr” → `~4333.33` monthly (±1%).
2. “2 years 3 months” → `27` months.
3. Idempotent results across re-invocations.

---

### R3 — Validation & Bounds
- Income: `0 ≤ monthlyIncome ≤ 50,000`
- Tenure: `0 ≤ jobTenureMonths ≤ 600`
- Non-finite or out-of-range values → recoverable error.

**Acceptance**
1. Out-of-range income/tenure returns `lastError` with specific code and `needs.financial=true`.
2. Valid ranges proceed to next checks.

---

### R4 — Discrepancy Clarification (Soft Gate)
- If `abs(jobTenureMonths - state.thresholds.jobTenureMinMonths) ≥ 3` **and** `financialProgress.discrepancyHandled !== true`:
  - Emit `onPrompt("TENURE_DISCREPANCY_EMPATHY")`
  - Set `financialProgress.discrepancyHandled=true`
  - Keep `needs.financial=true` for the follow-up turn (no hard attempt count)

**Acceptance**
1. Empathy prompt occurs **exactly once** per session unless state resets.
2. After clarification turn, node proceeds on next valid pass.

---

### R5 — State & Routing
- On success, set `needs.confirm = true` and all other needs false (except confirm).
- On retry, keep `needs.financial = true`.
- Node is **idempotent**; reducers merge without duplication.

**Acceptance**
1. Success routes to `confirm`; retry loops back to `financial`.
2. Re-running with same valid inputs does not double-count progress.

---

### R6 — Security & Telemetry
- Never log raw income/tenure; use **bucketed** values:
  - `income_bucket`: `<5k` | `5–10k` | `>10k`
  - `tenure_range`: `<12m` | `12–24m` | `>24m`
- Emit a single structured event per attempt; include `session_id`, `user_id`, `success`, `reason?`, redactions.
- Encrypted persistence for stored numbers is handled by the data layer; node must not downgrade security.

**Acceptance**
1. Telemetry contains no raw numeric values.
2. Encryption flags verified in integration tests (DB layer).

---

## 5) Voice/TTS Requirements

- **Income readback**: money in natural speech (e.g., “six thousand five hundred dollars”).
- **Tenure readback**: “two years and three months”.
- **Empathy script** (when discrepancy triggers):
  > “I show on your application that you’ve been employed for **X** months. Can you help me understand the difference?”
- Short, unambiguous prompts; no over-explanation of math.

**Acceptance**
1. TTS utilities produce expected phrasing for money and tenure.
2. Empathy prompt triggered only when required by R4.

---

## 6) LangChain/LangGraph Contract (concise code)

```ts
// nodes/financial.ts (contract skeleton)
import { RunnableLambda } from "@langchain/core/runnables";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

// 1) Zod schema
const FinancialExtract = z.object({
  incomeInput: z.union([z.string(), z.number()]),
  incomePeriod: z.enum(["hourly","weekly","biweekly","monthly","annual"]).optional(),
  jobTenure: z.union([z.string(), z.number()])
});

// 2) LangChain chain (Prompt -> Model -> Parser)
const model = new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0 });
const parser = new JsonOutputParser<{ incomeInput:any; incomePeriod?:string; jobTenure:any; }>({ schema: FinancialExtract });

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "Extract strictly valid JSON that matches the provided schema. If ambiguous, choose the most likely pay period."],
  ["human", "Message:\n{user_text}\n\nReturn JSON only."]
]);

const chain = prompt.pipe(model).pipe(parser);

// 3) Deterministic converters
const HOURS_PER_WEEK = Number(process.env.HOURS_PER_WEEK ?? 40);
const WEEKS_PER_YEAR = Number(process.env.WEEKS_PER_YEAR ?? 52);

const toMonthly = (amount:number, period?:string) => {
  switch (period) {
    case "hourly":   return (amount * HOURS_PER_WEEK * WEEKS_PER_YEAR) / 12;
    case "weekly":   return (amount * 52) / 12;
    case "biweekly": return (amount * 26) / 12;
    case "annual":   return amount / 12;
    case "monthly":
    default:         return amount;
  }
};

const tenureToMonths = (input: string | number) => {
  if (typeof input === "number") return Math.round(input);
  const y = parseFloat((input.match(/(\d+(?:\.\d+)?)\s*years?/) || [])[1] ?? "0");
  const m = parseFloat((input.match(/(\d+)\s*months?/) || [])[1] ?? "0");
  return Math.round(y * 12 + m);
};

const validIncome = (n:number) => Number.isFinite(n) && n >= 0 && n <= 50000;
const validTenure = (n:number) => Number.isFinite(n) && n >= 0 && n <= 600;

const redact = (val:number, kind:"income"|"tenure"="income") =>
  kind === "income"
    ? (val < 5000 ? "<5k" : val <= 10000 ? "5–10k" : ">10k")
    : (val < 12 ? "<12m" : val <= 24 ? "12–24m" : ">24m");

// 4) Node
export const financialNode = RunnableLambda.from(async ({ state, config }) => {
  if (!state.identityVerified || !state.collected?.contact) {
    return { lastError: { code: "PREREQUISITES_NOT_MET", recoverable: false } };
  }

  const inputText = config?.inputText ?? state?.lastUserMessage ?? "";
  const parsed = await chain.invoke({ user_text: inputText });

  const raw = typeof parsed.incomeInput === "string"
    ? Number(parsed.incomeInput.replace(/[^\d.]/g, ""))
    : Number(parsed.incomeInput);

  const monthlyIncome = toMonthly(raw, parsed.incomePeriod);
  const jobTenureMonths = tenureToMonths(parsed.jobTenure);

  if (!validIncome(monthlyIncome)) {
    config?.callbacks?.onEvent?.({ type: "financial_attempt", data: { success:false, reason:"INVALID_INCOME", redactions:{ income_bucket: redact(monthlyIncome,"income") } }});
    return { needs: { ...state.needs, financial: true }, lastError: { code: "INVALID_INCOME", recoverable: true } };
  }

  if (!validTenure(jobTenureMonths)) {
    config?.callbacks?.onEvent?.({ type: "financial_attempt", data: { success:false, reason:"INVALID_TENURE", redactions:{ tenure_range: redact(jobTenureMonths,"tenure") } }});
    return { needs: { ...state.needs, financial: true }, lastError: { code: "INVALID_TENURE", recoverable: true } };
  }

  const minMonths = state.thresholds?.jobTenureMinMonths ?? 15;
  if (Math.abs(jobTenureMonths - minMonths) >= 3 && !state.financialProgress?.discrepancyHandled) {
    config?.callbacks?.onPrompt?.("TENURE_DISCREPANCY_EMPATHY");
    return {
      needs: { ...state.needs, financial: true },
      financialProgress: { ...(state.financialProgress ?? {}), discrepancyHandled: true }
    };
  }

  config?.callbacks?.onEvent?.({
    type: "financial_collected",
    data: {
      incomeComplete: true,
      tenureComplete: true,
      redactions: {
        income_bucket: redact(monthlyIncome, "income"),
        tenure_range: redact(jobTenureMonths, "tenure")
      }
    }
  });

  return {
    collected: {
      ...state.collected,
      financial: { monthlyIncome, jobTenureMonths }
    },
    needs: { identity: false, contact: false, financial: false, confirm: true },
    financialProgress: { incomeComplete: true, tenureComplete: true, discrepancyHandled: true }
  };
});
````

---

## 7) Routing (graph edges)

From `financial`:

* **complete** → `confirm`
* **retry** (validation/clarification) → `financial`
* **system error** → (global `onError`) → `terminate`

There are **no hard attempt limits**; `financialProgress.discrepancyHandled` prevents empathy loops.

---

## 8) Tests (lean & scoped)

### Unit

* Income conversions for hourly/weekly/biweekly/annual/monthly (±1%).
* Tenure parsing: `"2 years 3 months" → 27`, `"18 months" → 18`, numeric → same.
* Validation rejects income > 50,000 and tenure > 600 or < 0.
* Redaction returns buckets/ranges (no raw values).

### Integration

* Happy path: contact complete → extract → normalize → `needs.confirm=true`.
* Invalid income → retry (`lastError=INVALID_INCOME`).
* Invalid tenure → retry (`lastError=INVALID_TENURE`).
* Discrepancy first pass triggers empathy once; second pass succeeds.
* Telemetry events contain only redacted financial fields.

### Voice formatting

* Income readback yields natural currency phrase.
* Tenure readback yields “X years and Y months”.
* Empathy script cue emitted exactly once per discrepancy.

---

## 9) Completion Criteria (atomic)

This unit is complete when:

* [ ] langchain extraction with Zod schema returns deterministic JSON.
* [ ] Income & tenure normalization + validation pass all tests.
* [ ] Discrepancy empathy triggers once and unblocks on next valid pass.
* [ ] State writes `collected.financial` and sets `needs.confirm=true`.
* [ ] Telemetry redaction enforced; no raw financial data in logs.
* [ ] Integration tests pass (`npm test -- --testPathPattern=financial`).
* [ ] Build compiles and types check clean (`npm run build`, `npm run type-check`).

**Success Validation**

```bash
npm test -- --testPathPattern=financial
npm run build
npm run type-check
```