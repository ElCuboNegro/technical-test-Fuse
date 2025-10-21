---
inclusion: always
---

# Development Standards & Deliverables

## Agent Architecture Requirements

### Module Pattern Compliance
- All agents MUST follow the established structure: `graph.ts`, `state.ts`, `configuration.ts`, `prompts.ts`, `tools.ts`, `utils.ts`
- Use TypeScript strict mode with comprehensive type definitions
- Implement proper error boundaries with graceful failure handling
- Voice-optimized response formatting for TTS compatibility

### State Management
- Use LangGraph state management patterns consistently
- Implement identity verification as security checkpoint with termination logic
- Handle conversation flow transitions with proper validation
- Maintain conversation context across multi-step verification processes
- use LangGraph state management patterns consistently
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
- all the conversations should be kept in the database

## Code Quality Standards

### TypeScript Implementation
- Strict typing throughout all modules
- Proper interface definitions for agent states and configurations
- Use named exports over default exports
- Follow established import patterns: external libraries first, then internal modules

### Error Handling Patterns
- Professional failure communication for verification failures
- Graceful degradation when services are unavailable
- Comprehensive logging without exposing PII
- Security-first approach to data validation

### Voice Interface Optimization
- Speech-friendly formatting for all responses including termination messages
- Natural conversation pacing and structure
- Professional tone for sensitive financial information
- Clear pronunciation of financial terminology and confirmations

## Testing Requirements

### Test Coverage Standards
- Unit tests for all agent logic and state transitions
- Integration tests for database connectivity and external services
- End-to-end conversation flow testing with mock data generators
- Edge case validation including verification failures and data discrepancies

### Mock Data Usage
- Use provided mock data generators for testing without real PII
- Test all scenarios from input test specifications
- Validate conversation quality and professional communication
- Ensure security gate functionality works correctly

## Security & Compliance

### Identity Verification
- Implement identity verification as critical security checkpoint
- Professional termination handling for verification failures
- Maximum 2 attempts for identity verification before call termination
- Secure handling of SSN, DOB, and other sensitive data

### Data Protection
- No PII exposure in logs or error messages
- Compliance-ready logging and monitoring
- Secure database connections with proper connection pooling
- Environment variable management for sensitive configuration

## Production Deployment

### Containerization Standards
- Docker containerization for all services
- Health monitoring endpoints for service status
- Database migration scripts and seed data management
- Performance monitoring and optimization guidelines

### Service Integration
- pgvector integration for document and memory storage
- Redis caching for session management
- PostgreSQL with proper indexing and connection pooling
- LangGraph CLI integration for agent orchestration
