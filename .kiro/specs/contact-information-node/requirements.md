# Contact Information Node — Simplified Spec (DB-Backed, Scoped)

## 1) Purpose

A **contact collection gate** that gathers **complete mailing address** and **optional email** after successful identity verification. On success it unlocks the financial step; handles missing unit numbers gracefully and validates email with **letter-by-letter confirmation**. All contact data is voice-optimized for TTS and securely stored.

## 2) Definitions (minimal)

* **Contact node**: LangGraph node that extracts and validates address + email.
* **Address components**: Street, city, state, ZIP code, optional unit number.
* **Unit number logic**: Smart detection and single-request collection for multi-unit addresses.
* **Email spelling confirmation**: Letter-by-letter TTS verification of email addresses.
* **Contact PII**: Address and email information requiring secure handling.

## 3) Inputs & Outputs

### Inputs (from graph/state)

* User utterance (text from upstream layer).
* `state.identityVerified` (boolean - must be true).
* `state.contactProgress` (tracking object).
* Config callbacks for logging/telemetry.

### Outputs (state deltas)

* **On success:**
  * `collected.contact = { address: {...}, email?: string }`
  * `needs = { identity:false, contact:false, financial:true, confirm:false }`
  * `contactProgress = { addressComplete:true, emailComplete:true, unitNumberAsked:true }`
* **On incomplete/retry:**
  * `needs.contact = true`
  * Updated `contactProgress` tracking

## 4) Functional Requirements

### R1 — Address Collection & Validation

* Collect **street address, city, state, ZIP code** via **structured extraction**.
* Validate state codes against 50 US states + DC.
* Validate ZIP format as 5-digit or 9-digit (XXXXX or XXXXX-XXXX).
* Smart unit number detection and single-request collection.

**Acceptance**

1. Collect address components in logical sequence.
2. Validate state codes and ZIP format.
3. Detect multi-unit addresses and ask for unit number once.
4. Normalize components (trim, uppercase state).

### R2 — Email Collection & Verification

* Request **optional email address** after address completion.
* Validate email format using standard regex.
* **Letter-by-letter spelling confirmation** for TTS accuracy.
* Handle "no email" gracefully without blocking flow.

**Acceptance**

1. Email collection is optional and clearly communicated.
2. Email format validation with clear error messages.
3. Spell email back letter-by-letter for confirmation.
4. Allow correction if spelling confirmation fails.

### R3 — Voice/TTS Optimization

* **Address readback** with natural pauses between components.
* **ZIP codes** spelled digit-by-digit ("1-2-3-4-5").
* **Email spelling** with "@" as "at" and "." as "dot".
* Professional, conversational tone throughout.

**Acceptance**

1. Address confirmation uses TTS-friendly formatting.
2. ZIP codes and emails spelled appropriately.
3. Clear unit number request: "apartment, suite, or unit number".
4. Professional tone maintained throughout collection.

### R4 — State Management & Flow

* Verify `identityVerified = true` before proceeding.
* Update state with complete contact information.
* Set routing flags for next step (financial).
* Track progress to prevent duplicate requests.

**Acceptance**

1. Prerequisites checked before collection starts.
2. State updated with normalized contact data.
3. Proper routing flags set for financial node.
4. Progress tracking prevents duplicate unit requests.

### R5 — Error Handling & Recovery

* Handle validation failures with specific component requests.
* Provide format examples for invalid inputs.
* Allow re-entry with simplified prompts.
* Graceful recovery from system errors.

**Acceptance**

1. Specific validation error messages.
2. Clear format examples for corrections.
3. Simplified retry prompts.
4. System errors logged and handled gracefully.

### R6 — Security & Data Protection

* Validate and sanitize all inputs before storage.
* Normalize email addresses (lowercase, trim).
* Secure storage with encryption.
* Audit trail for collection events.

**Acceptance**

1. Input validation and sanitization.
2. Email normalization applied.
3. Encrypted storage implementation.
4. Audit events logged securely.

## 5) Node Contract (concise code)

```ts
// nodes/contact.ts (contract skeleton)
import { RunnableLambda } from "@langchain/core/runnables";
import { z } from "zod";
import { validateAddress, normalizeAddress } from "../utils/address-validation";
import { validateEmail, spellEmailForTTS } from "../utils/email-validation";
import { redactContactPII } from "../security/redaction";

const AddressExtract = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/),
  unitNumber: z.string().optional()
});

const EmailExtract = z.string().email().optional();

export const contactNode = RunnableLambda.from(async ({ state, config }) => {
  // 1) Verify prerequisites
  if (!state.identityVerified) {
    return {
      lastError: { code: "IDENTITY_NOT_VERIFIED", recoverable: false }
    };
  }

  // 2) Extract address via structured extraction
  const addressData = await extractWithSchema(AddressExtract);
  const normalizedAddress = normalizeAddress(addressData);

  // 3) Handle unit number if needed and not already asked
  const finalAddress = await handleUnitNumber(
    normalizedAddress, 
    state.contactProgress?.unitNumberAsked || false
  );

  // 4) Extract and validate email
  const emailData = await extractWithSchema(EmailExtract);
  if (emailData && !await confirmEmailSpelling(emailData)) {
    return {
      needs: { ...state.needs, contact: true },
      lastError: { code: "EMAIL_CONFIRMATION_FAILED", recoverable: true }
    };
  }

  // 5) Telemetry (redacted)
  config?.callbacks?.onEvent?.({
    type: "contact_collected",
    data: { 
      addressComplete: true, 
      emailProvided: !!emailData,
      address: redactContactPII(finalAddress),
      email: emailData ? "****@****.***" : null
    }
  });

  // 6) State update
  return {
    collected: {
      ...state.collected,
      contact: { address: finalAddress, email: emailData }
    },
    needs: { identity: false, contact: false, financial: true, confirm: false },
    contactProgress: {
      addressComplete: true,
      emailComplete: true,
      unitNumberAsked: true
    }
  };
});
```

## 6) Routing (graph edges)

* From `contact`:
  * if contact collection complete → `financial`
  * else if needs retry → `contact` (retry loop)
  * if system error → `terminate`

## 7) Voice Prompts (examples)

* **Address request:**
  "Now I need your complete mailing address. Please provide your street address, including house or building number."

* **Unit number:**
  "I notice this might be a multi-unit building. Do you have an apartment number, suite number, or unit number?"

* **Email request:**
  "I'd like to collect your email address if you have one. Can you provide your email?"

* **Email spelling:**
  "Let me spell that back: j-o-h-n dot s-m-i-t-h at g-m-a-i-l dot c-o-m. Is that correct?"

* **Address confirmation:**
  "Your mailing address is 123 Main Street, Unit 4B, Anytown, California, 1-2-3-4-5. Is that correct?"

## 8) Security Utilities (contact-specific)

```ts
// utils/address-validation.ts
export function validateState(state: string): boolean {
  const validStates = ['AL', 'AK', 'AZ', /* ... all 50 + DC */];
  return validStates.includes(state.toUpperCase());
}

export function normalizeAddress(address: any): any {
  return {
    street: address.street.trim(),
    city: address.city.trim(),
    state: address.state.toUpperCase().trim(),
    zipCode: address.zipCode.replace(/\s/g, ''),
    unitNumber: address.unitNumber?.trim() || undefined
  };
}
```

```ts
// utils/email-validation.ts
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function spellEmailForTTS(email: string): string {
  return email
    .replace('@', ' at ')
    .replace(/\./g, ' dot ')
    .split('')
    .join(' ');
}
```

## 9) Tests (lean & scoped)

### Unit
* Complete address collection with all components.
* Unit number detection and single-request logic.
* Email validation and spelling confirmation.
* Missing email handling (graceful skip).

### Integration
* Address normalization and validation.
* Email confirmation flow (success/retry).
* State updates and routing flags.
* Progress tracking across retries.

### Voice formatting
* Address readback with proper pauses.
* ZIP code digit spelling.
* Email letter-by-letter spelling.

## 10) Completion Criteria (atomic)

**This unit is complete when:**

* [ ] Address collection works with validation
* [ ] Unit number logic asks once per conversation
* [ ] Email validation and spelling confirmation implemented
* [ ] Voice-optimized formatting for all outputs
* [ ] State management integrates with LangGraph
* [ ] Error handling provides clear recovery paths
* [ ] Security measures protect contact PII
* [ ] Unit tests pass for all collection scenarios
* [ ] Integration tests confirm end-to-end flow
* [ ] Build compiles without errors

### Success Validation

```bash
# Run tests for this atomic unit only
npm test -- --testPathPattern=contact

# Verify build compiles
npm run build

# Check TypeScript types
npm run type-check
```