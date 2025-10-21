---
inclusion: always
---

# Voice Verification Agent Implementation Guide

## Architecture Requirements

Build a LangGraph-based verification agent that conducts multi-step financial verification conversations. The agent must implement a strict identity gate pattern with professional failure handling and voice-optimized responses.

### Core Implementation Pattern

- Use LangGraph state management for conversation flow
- Implement identity verification as a critical security gate
- Design voice-optimized prompts for text-to-speech systems
- Handle sensitive financial data with appropriate security measures

## Required Conversation Flow

### 1. Identity Verification (Critical Gate)

**Must collect and verify:**
- Date of birth (month, day, year format)
- Last 4 digits of Social Security Number
- Confirmation of both pieces

**Failure handling:** If verification fails after reasonable attempts, terminate with professional script:
> "I understand this can be frustrating. However, the last four digits of your Social Security Number and date of birth are required to proceed with the verification. Since we're unable to verify this information today, I'll need to conclude our call. Thank you for your time, and please feel free to call back when you have this information available."

### 2. Personal Information Collection (Only if identity verified)

- Complete mailing address (street, city, state, zip code)
- Unit number verification (only ask if not provided initially)
- Email address with validation and confirmation

### 3. Financial Information Collection

- Monthly income before taxes
- Current job tenure
- **Critical Logic:** Compare job tenure to threshold variable
- If tenure discrepancy exists: "I show on your application that you've been employed for [X] months. Can you help me understand the difference?"

### 4. Final Information Confirmation

- Summary of all collected information
- Final user confirmation before completion

## Technical Implementation Requirements

### LangGraph Agent Structure

```typescript
interface VerificationState {
  conversationPhase: 'identity' | 'contact' | 'financial' | 'confirmation' | 'terminated'
  identityVerified: boolean
  collectedData: {
    identity: { dob?: string; ssnLast4?: string }
    contact: { address?: Address; email?: string }
    financial: { monthlyIncome?: number; jobTenure?: number }
  }
  jobTenureThreshold: number
  attemptCounts: { identity: number }
}
```

### Identity Verification Gate Logic

- **Security checkpoint:** All subsequent nodes depend on successful verification
- **Failure termination:** Clean call ending with professional explanation
- **Retry logic:** Implement reasonable attempt limits (2-3 attempts)
- **State management:** Track verification status across conversation

### Voice Optimization Requirements

All agent responses must be optimized for text-to-speech:

- **Numbers:** Spoken digit-by-digit where appropriate ("7-2-3-4" not "7234")
- **Financial amounts:** Natural speech formatting ("six thousand five hundred dollars")
- **Email confirmation:** Letter-by-letter spelling
- **Addresses:** Natural pause patterns for comprehension
- **Dates:** Full word formatting ("March fifteenth, nineteen eighty-five")
- **Call termination:** Professional, empathetic tone

### Financial Data Handling

- **Income validation:** Accept various formats (annual, hourly conversions)
- **Tenure comparison:** Silent internal comparison with threshold
- **Discrepancy handling:** Professional explanation requests using provided script
- **Sensitive information:** Appropriate tone for financial discussions

## Security & Compliance Requirements

### Identity Verification Security

- Treat identity verification as primary security checkpoint
- Implement proper failure handling with professional communication
- No bypass mechanisms for failed identity verification
- Log verification attempts for security monitoring

### Data Handling

- Handle PII with appropriate security measures
- Implement proper data validation and sanitization
- Use secure storage for collected information
- Follow financial services compliance standards

## Testing Requirements

### Test Scenarios (Use provided JSON test data)

1. **Successful verification flow** - Standard employed applicant
2. **Identity verification failure** - Wrong SSN/DOB multiple times
3. **Job tenure discrepancy** - Difference between stated and application tenure
4. **Self-employed applicant** - Variable income handling
5. **Address clarification** - Unit number collection
6. **Partial identity failure then success** - Recovery scenarios

### Testing Framework

- Validate conversation quality and natural flow
- Test identity verification gate functionality
- Verify professional failure handling
- Test voice optimization formatting
- Validate financial data processing logic

## Code Style & Patterns

### LangGraph Implementation

- Use TypeScript for type safety
- Implement proper state management
- Create reusable prompt templates
- Handle errors gracefully with user-friendly messages

### Voice-Optimized Responses

- Format numbers for speech synthesis
- Use natural conversation pacing
- Include appropriate confirmations
- Handle interruptions and clarifications

### Professional Communication

- Maintain consistent professional tone
- Build trust through clear explanations
- Handle sensitive information appropriately
- Provide clear next steps for failures

## Integration Points

- **LLM Services:** Clean integration with OpenAI/Anthropic
- **Database:** Store conversation state and collected data
- **Logging:** Track conversation flow and verification attempts
- **Testing:** Mock data generators for various scenarios
- **Monitoring:** Conversation state visualization tools