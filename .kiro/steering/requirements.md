---
inclusion: always
---


# Voice Verification Agent Requirements

## Security Implementation Standards

### Identity Verification Gate
- Implement strict identity verification as mandatory security checkpoint
- Maximum 2 attempts for identity verification (SSN last 4 digits + date of birth)
- Professional, respectful language for call termination due to verification failures
- No PII exposure in logs, error messages, or debugging output
- Secure conversation state management with validation at each step

### Data Protection
- Never log sensitive data (SSN, DOB, addresses, income)
- Use placeholder values in error messages and debugging
- Implement secure database connections with connection pooling
- Environment variable management for sensitive configuration

## Conversation Flow Architecture

### Required Flow Sequence
1. **Identity Verification** (security gate - failure terminates call)
2. **Contact Information** (mailing address, optional email)
3. **Employment Verification** (income, job tenure with discrepancy handling)
4. **Final Confirmation** (complete information summary)

### Voice Interface Standards
- Format all responses for text-to-speech compatibility
- Spell out critical information (SSN digits: "7-2-3-4", email addresses letter by letter)
- Use natural conversation pacing with confirmation loops
- Professional tone throughout, especially during sensitive data collection
- Clear pronunciation of financial terminology

### Discrepancy Handling
- Address data discrepancies with clarifying questions, not assumptions
- Compare stated job tenure vs application data professionally
- Handle missing information (no email, no unit number) gracefully
- Use threshold-based validation (15+ months job tenure expected)

## Technical Implementation Standards

### LangGraph Architecture
- Use proper LangGraph state patterns with comprehensive type definitions
- Implement conversation nodes with proper state transitions
- Handle verification attempts and failure tracking in state
- Maintain conversation context across multi-step processes

### Agent Module Pattern
Follow established structure for all agents:
- `graph.ts` - LangGraph definition and node orchestration
- `state.ts` - Typed state schema with validation
- `configuration.ts` - Agent configuration and settings
- `prompts.ts` - Voice-optimized prompts and response templates
- `tools.ts` - Agent tools and external integrations
- `utils.ts` - Helper functions and data validation

### Code Quality Standards
- TypeScript strict mode with comprehensive type definitions
- Named exports over default exports for consistency
- Import grouping: external libraries first, then internal modules
- Comprehensive error boundaries with graceful degradation
- Professional failure communication maintaining customer relationships

## Testing & Validation Requirements

### Test Coverage
- All scenarios from input test specifications must pass
- Identity verification failures and edge cases
- Data discrepancy handling and clarification flows
- Missing information scenarios (no email, no unit number)
- Professional termination communication

### Mock Data Usage
- Use provided mock data generators for PII-free testing
- Test conversation quality and professional communication
- Validate voice-optimized response formatting
- Ensure security gate functionality works correctly

### Integration Testing
- Database connectivity and state persistence
- External service integration and error handling
- Conversation flow transitions and state management
- Health monitoring and service status validation

## Compliance & User Experience

### Financial Industry Standards
- Demonstrate understanding of security requirements in financial applications
- Professional communication to build user confidence
- Clear explanations of verification requirements and next steps
- Respectful failure handling with dignity and clear guidance

### Voice Conversation Quality
- Natural conversation pacing and structure
- Professional tone for sensitive financial information
- Clear confirmation loops for critical data
- Smooth transitions between verification steps
- Empathetic communication during verification challenges