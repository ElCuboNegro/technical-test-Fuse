---
inclusion: always
---

# Voice Verification Conversation Patterns

## Core Conversation Flow Structure

### Node 1: Identity Verification (Critical Security Gate)

- **Purpose**: Mandatory security checkpoint - conversation MUST terminate on failure
- **Required Fields**: Full name confirmation, date of birth (MM/DD/YYYY), last 4 SSN digits
- **Max Attempts**: 2 verification attempts before termination
- **Voice Optimization**: Spell out SSN digits individually (7-2-3-4), confirm dates clearly

#### Successful Identity Verification Example

**Agent:** Hello, my name is Sarah, I'm calling from Fuse Finance regarding your recent vehicle financing application. This call may be recorded for quality assurance. Am I speaking with Michael Thompson?

**User:** Yes, that's me.

**Agent:** For security purposes, I need to verify your identity. Can you please provide your date of birth? Please give me the month, day, and year.

**User:** March 15th, 1985.

**Agent:** Thank you. Now I will give you the first digits of your social security number, please give me the last 4, 1-0-85-27

**User:** 7948.

**Agent:** Let me confirm this information. Your date of birth is March 15th, 1985, and the last four digits of your Social Security Number are 7-9-4-8. Is that correct?

**User:** Yes, that's correct.

#### Failed Identity Verification Example

**Agent:** Hello, I'm calling from SAFCO regarding a vehicle financing application. Am I speaking with Jennifer Martinez?

**User:** Yeah, that's me.

**Agent:** For security purposes, I need to verify your identity. Can you provide your date of birth with the month, day, and year?

**User:** June 22nd, 1990.

**Agent:** And the last four digits of your Social Security Number?

**User:** Um... 8492.

**Agent:** Let me confirm: your date of birth is June 22nd, 1990, and the last four digits of your Social Security Number are 8-4-9-2. Is that correct?

**User:** Yes, that should be right.

**Agent:** I'm unable to verify this information with our records. Let me try once more. Can you please confirm your date of birth and the last four digits of your Social Security Number?

**User:** I'm pretty sure it's June 22nd, 1990, and 8492.

**Agent:** I understand this can be frustrating. However, the last four digits of your Social Security Number and date of birth are required to proceed with the verification. Since we're unable to verify this information today, I'll need to conclude our call. Thank you for your time, and please feel free to call back when you have this information available.

**User:** Wait, can't we try something else?

**Agent:** I'm sorry, but for security purposes, we cannot proceed without proper identity verification. Have a good day.

### Node 2: Contact Information Collection

- **Required**: Complete mailing address (street, city, state, ZIP)
- **Optional**: Unit/apartment number, email address
- **Voice Optimization**: user spells out email addresses letter by letter, system can verify email letter by letter
- **Pattern**: Always ask about unit numbers separately for clarity

#### Contact Information Collection Example

**Agent:** Perfect, your identity has been verified. Now I need to collect your current mailing address. Please provide your complete address including street, city, state, and ZIP code.

**User:** 1247 Oak Street, Denver, Colorado, 80202.

**Agent:** I have 1247 Oak Street, Denver, Colorado, 80202. Is there a unit number or apartment number for this address?

**User:** Yes, it's Unit 3B.

**Agent:** Thank you. So your complete mailing address is 1247 Oak Street, Unit 3B, Denver, Colorado, 80202. Is that correct?

**User:** Yes, that's right.

**Agent:** I'll need your email address for our records and future communications. Please spell it out for me.

**User:** It's mthompson.denver@gmail.com.

**Agent:** Let me confirm that email address: M-T-H-O-M-P-S-O-N dot D-E-N-V-E-R at G-M-A-I-L dot com. Is that correct?

**User:** That's correct.

### Node 3: Employment & Income Verification

- **Required**: Monthly income (pre-tax), job tenure in months
- **Discrepancy Handling**: Compare stated tenure vs application data
- **Threshold**: 15+ months job tenure expected
- **Voice Optimization**: Handle numerical discrepancies professionally

#### Employment Verification with Tenure Discrepancy Example

**Agent:** Now I need to verify your employment and income information. What is your monthly income before taxes?

**User:** $6,500 per month.

**Agent:** How long have you been working at your current job?

**User:** About eight months now.

**Agent:** I show on your application that you've been employed for 36 months. Can you help me understand the difference between what you're telling me now - eight months - and what's shown on the application?

**User:** Oh, I see the confusion. I've been with the same company for three years, but I got promoted to a new position eight months ago. Same employer, just a different role.

**Agent:** Thank you for clarifying that. So you've been with the same company for three years total, correct?

**User:** Yes, that's right.

### Node 4: Final Confirmation

- **Purpose**: Complete information summary for accuracy
- **Pattern**: Read back all collected information systematically
- **Voice Optimization**: Clear, structured summary format

#### Final Confirmation Example

**Agent:** Let me summarize the information we've collected today to make sure everything is accurate. Your date of birth is March 15th, 1985. Your mailing address is 1247 Oak Street, Unit 3B, Denver, Colorado, 80202. Your email is mthompson.denver@gmail.com. Your monthly income is $6,500, and you've been with your current employer for three years. Is all of this information correct?

**User:** Yes, that's all correct.

**Agent:** Excellent. Your verification is now complete. Thank you for your time today, Mr. Thompson.

## Critical Implementation Rules

### Security Requirements
- Identity verification is a hard gate - no exceptions or workarounds
- Professional failure communication maintains customer relationship
- Maximum 2 identity verification attempts before call termination
- No sensitive data logging in conversation state

### Voice Interface Optimization
- Spell out all critical information (SSN digits, email addresses)
- Use natural conversation pacing with confirmation loops
- Format numbers and dates consistently for TTS clarity
- Professional tone throughout, especially during failures

### State Management Patterns
- Track verification attempts and failure reasons
- Maintain conversation context across nodes
- Handle discrepancies with clarification requests
- Log conversation flow for analysis (without PII)

### Error Handling Standards
- Graceful failure with professional communication
- Clear explanation of requirements without compromise
- Respectful call termination when security fails
- No debugging information exposed to users


## Testing Patterns
- Use mock data generators for PII-free testing
- Test all failure scenarios including edge cases
- Validate voice-optimized response formatting
- Ensure professional tone in all termination scenarios
