---
inclusion: always
---

# Voice Verification Agent - System Design Document

## Project Overview

Build a Node.js LangGraph-based voice verification agent for financial services that conducts multi-step identity and financial verification calls. The system uses conversational text interface with strict security gates, professional failure handling, and comprehensive conversation logging with privacy-compliant pseudonymization for regulatory compliance and analytics.

## Architecture Patterns

### LangGraph Agent Structuref scope) wi

Follow the established agent module pattern:

- `apps/agents/voice-verification/graph.ts` - LangGraph orchestration
- `apps/agents/voice-verification/state.ts` - Typed conversation state
- `apps/agents/voice-verification/configuration.ts` - Agent configuration
- `apps/agents/voice-verification/prompts.ts` - Voice-optimized prompts
- `apps/agents/voice-verification/tools.ts` - Verification tools
- `apps/agents/voice-verification/utils.ts` - Helper functions

### State Management Pattern

```typescript
interface VerificationState {
  conversationPhase: 'identity' | 'contact' | 'financial' | 'confirmation' | 'terminated'
  identityVerified: boolean
  attemptCounts: { identity: number }
  collectedData: {
    identity: { dob?: string; ssnLast4?: string }
    contact: { address?: Address; email?: string }
    financial: { monthlyIncome?: number; jobTenure?: number }
  }
  jobTenureThreshold: number // Default: 24 months
}
```

## Critical Security Requirements

### Identity Verification Gate

- **MANDATORY**: Identity verification is a hard security gate
- **Maximum 2 attempts** before professional call termination
- **No bypass logic** - all subsequent nodes depend on `identityVerified: true`
- **Professional termination script**: Use exact wording provided in examples

### PII Protection

- Never log sensitive data (SSN, DOB, addresses, income) in raw form
- Use placeholder values in error messages and debugging
- Hash sensitive data before database storage
- Comprehensive pseudonymization system for all conversation logs
- Database-level PII detection triggers prevent raw PII insertion
- Deterministic pseudonymization with rotating salts managed by KMS

## Conversation Flow Architecture

### Required Node Sequence

1. **Identity Verification** (Critical Gate)
   - Collect DOB (MM/DD/YYYY format)
   - Collect SSN last 4 digits
   - Verify against database
   - Professional termination on failure

2. **Contact Information** (Post-Identity Only)
   - Complete mailing address
   - Unit number (ask separately if missing)
   - Email with letter-by-letter confirmation

3. **Financial Verification**
   - Monthly income (accept annual/hourly, convert silently)
   - Job tenure comparison with threshold
   - Discrepancy handling with empathy script

4. **Final Confirmation**
   - Complete information summary
   - User confirmation before completion

## Voice Optimization Standards

### TTS-Friendly Formatting

- **SSN digits**: "7-2-3-4" (individual digits)
- **Email spelling**: "M-T-H-O-M-P-S-O-N dot D-E-N-V-E-R at G-M-A-I-L dot com"
- **Dates**: "March fifteenth, nineteen eighty-five"
- **Financial amounts**: "six thousand five hundred dollars"
- **Professional tone**: Maintain empathy during failures

### Conversation Patterns

- Use confirmation loops for critical data
- Natural pause patterns for comprehension
- Professional, trustworthy tone throughout
- Clear explanations without being accusatory

## Technical Implementation Standards

### Database Integration

- PostgreSQL for conversation state persistence
- Identity verification boundary (boolean/enum responses only)
- Comprehensive conversation logging with pseudonymization enforcement
- Immutable audit trail with database triggers preventing modifications
- Connection pooling and proper error handling
- Field-level encryption and row-level security policies

### Error Handling

- Graceful failure with professional communication
- No debugging information exposed to users
- Fail-closed security approach
- Professional termination scripts

### Testing Requirements

- Mock data generators for PII-free testing
- All conversation scenarios from examples must pass
- Edge case validation (missing info, discrepancies)
- Professional communication quality validation

## Code Style Conventions

### TypeScript Standards

- Strict mode enabled
- Named exports over default exports
- Comprehensive type definitions for all state
- Proper error boundaries with typed exceptions

### File Organization

- Follow established agent module structure
- Group imports: external libraries first, internal modules second
- Use meaningful variable names for financial terminology
- Professional comment style for sensitive logic

## Mandatory Termination Script

When identity verification fails after 2 attempts:

> "I understand this can be frustrating. However, the last four digits of your Social Security Number and date of birth are required to proceed with the verification. Since we're unable to verify this information today, I'll need to conclude our call. Thank you for your time, and please feel free to call back when you have this information available."

## Integration Requirements

- LLM integration for natural language processing
- Database boundary for identity verification
- Comprehensive conversation logging with pseudonymization
- Passive observer pattern for event collection from LangGraph runtime
- Health monitoring endpoints with PII-free metrics
- Compliance reporting interfaces for regulatory audits

## Conversation Logging Architecture

### System Components

- **Event Collector**: Non-blocking ingestion of LangGraph events
- **Pseudonymization Engine**: Deterministic PII masking with cryptographic hashing
- **Async Ring Buffer**: Bounded memory queue with backpressure control
- **Storage Adapter**: Resilient persistence with failure handling
- **Audit Builder**: Immutable compliance trail generation
- **Compliance Engine**: Privacy-safe query interfaces for analytics

### Event Processing Flow

1. LangGraph nodes emit `EventEnvelope` structures
2. Event Collector validates and buffers asynchronously
3. Pseudonymization Engine transforms payloads deterministically
4. Audit Builder constructs redacted audit records
5. Storage Adapter persists to PostgreSQL with retry policies

### Database Schema

- `conversation_events`: Unified event log with pseudonymized JSONB payloads
- `audit_events`: Immutable audit trail with database triggers
- `graph_nodes`/`graph_edges`: PII-safe visualization data
- `pseudonym_cache`: Deterministic re-mapping with TTL enforcement

### Performance Requirements

- Write latency: p95 ≤ 50ms with async processing
- Query latency: p95 ≤ 200ms with indexed views
- Backpressure activation at 80% buffer capacity
- Storage outage resilience with local buffering

## Example Conversation Flows

### Successful Identity Verification

**Agent:** Hello, my name is Sarah, I'm calling from Fuse Finance regarding your recent vehicle financing application. This call may be recorded for quality assurance. Am I speaking with Michael Thompson?

**User:** Yes, that's me.

**Agent:** For security purposes, I need to verify your identity. Can you please provide your date of birth? Please give me the month, day, and year.

**User:** March 15th, 1985.

**Agent:** Thank you. Now I need the last four digits of your Social Security Number.

**User:** 7234.

**Agent:** Let me confirm this information. Your date of birth is March 15th, 1985, and the last four digits of your Social Security Number are 7-2-3-4. Is that correct?

**User:** Yes, that's correct.

### Failed Identity Verification

**Agent:** I'm unable to verify this information with our records. Let me try once more. Can you please confirm your date of birth and the last four digits of your Social Security Number?

**User:** I'm pretty sure it's June 22nd, 1990, and 8492.

**Agent:** I understand this can be frustrating. However, the last four digits of your Social Security Number and date of birth are required to proceed with the verification. Since we're unable to verify this information today, I'll need to conclude our call. Thank you for your time, and please feel free to call back when you have this information available.

### Financial Discrepancy Handling

**Agent:** How long have you been working at your current job?

**User:** About eight months now.

**Agent:** I show on your application that you've been employed for 36 months. Can you help me understand the difference between what you're telling me now - eight months - and what's shown on the application?

**User:** Oh, I see the confusion. I've been with the same company for three years, but I got promoted to a new position eight months ago. Same employer, just a different role.

**Agent:** Thank you for clarifying that. So you've been with the same company for three years total, correct?

## Key Implementation Rules

### Security-First Approach

- Identity verification gates all subsequent functionality
- Professional failure communication maintains customer relationships
- No PII exposure in logs, error messages, or debugging output
- Secure database connections with proper connection pooling

### Voice Interface Optimization

- All responses optimized for text-to-speech compatibility
- Natural conversation pacing with confirmation loops
- Professional tone throughout, especially during sensitive data collection
- Clear pronunciation of financial terminology

### State Management

- Use LangGraph state management patterns consistently
- Handle conversation flow transitions with proper validation
- Maintain conversation context across multi-step verification processes
- Track attempt counts and failure reasons for audit purposes

### Testing Standards

- Unit tests for all agent logic and state transitions
- Integration tests for database connectivity and external services
- End-to-end conversation flow testing with mock data generators
- Edge case validation including verification failures and data discrepancies
- Comprehensive testing for conversation logging and pseudonymization
- Performance testing for latency and throughput requirements
- Security testing for PII pattern detection and privacy compliance

## Current Development Status

### Implemented Components

- ✅ Database seeding system with comprehensive mock data scenarios
- ✅ PostgreSQL migration system with CLI tools
- ✅ Test infrastructure with environment configuration
- ✅ Core database connection and validation utilities
- ✅ Mock data parsing and validation framework

### In Development: Conversation Logging & Pseudonymization

The conversation logging system is currently in the specification and design phase, with implementation planned in atomic development cycles:

#### Phase 1: Core Infrastructure
- [ ] Event envelope interfaces and type definitions
- [ ] Pseudonymization engine with deterministic hashing
- [ ] Ring buffer implementation with backpressure control
- [ ] Event collector with non-blocking processing

#### Phase 2: Database Integration
- [ ] Database schema with pseudonymization enforcement
- [ ] PII detection triggers and stored procedures
- [ ] Storage adapter with failure handling
- [ ] Audit trail builder with immutable records

#### Phase 3: Compliance & Analytics
- [ ] Compliance engine with privacy-safe queries
- [ ] Metrics system with PII-free observability
- [ ] Data validation and consistency framework
- [ ] Privacy impact assessment capabilities

#### Phase 4: Integration & Testing
- [ ] LangGraph runtime integration
- [ ] Comprehensive test suite (unit, integration, performance)
- [ ] End-to-end validation with real conversation flows
- [ ] Security and compliance validation

### Implementation Approach

Following atomic development principles with test-driven development:
- Single responsibility components with comprehensive unit tests
- Integration testing for each component before moving to next
- Performance benchmarking against specified latency requirements
- Security validation with automated PII pattern scanning