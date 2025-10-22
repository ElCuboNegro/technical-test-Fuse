/**
 * Contact Information Voice-Optimized Prompts
 * 
 * Provides TTS-optimized prompts for contact information collection
 * with natural conversation flow and professional tone.
 * 
 * Requirements: R3.1, R3.2, R3.3, R3.4
 */

import { formatAddressForTTS, formatZipForTTS, spellEmailForTTS } from '../utils/voice-formatting';

export interface AddressData {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  unitNumber?: string;
}

/**
 * Contact information collection prompts optimized for TTS
 * 
 * Requirements: R3.1, R3.2, R3.3, R3.4
 */
export const CONTACT_PROMPTS = {
  // Address collection prompts (sequential, logical flow)
  addressRequest: `Now I need your complete mailing address. Please provide your street address, including house or building number.`,
  
  cityRequest: `Thank you. What city is that in?`,
  
  stateRequest: `And what state? Please give me the two-letter state code, like C-A for California.`,
  
  zipRequest: `Finally, what is your ZIP code?`,
  
  // Complete address request (single prompt)
  completeAddressRequest: `Now I need your complete mailing address. Please provide your street address, city, state, and ZIP code.`,
  
  // Unit number handling (smart detection, single request)
  unitNumberRequest: `I notice this might be a multi-unit building. Do you have an apartment number, suite number, or unit number?`,
  
  unitConfirmation: (unit: string) => 
    `I have unit ${unit}. Is that correct?`,
  
  noUnitNeeded: `No problem. I'll record the address without a unit number.`,
  
  // Address confirmation with TTS formatting
  addressConfirmation: (address: AddressData) => 
    `Your mailing address is ${formatAddressForTTS(address)}. Is that correct?`,
  
  // Email collection (optional, clearly communicated)
  emailRequest: `I'd like to collect your email address if you have one. Can you provide your email?`,
  
  emailOptional: `Email is optional. If you prefer not to provide one, just say "no email" and we'll continue.`,
  
  noEmailAccepted: `That's perfectly fine. I'll note that you prefer not to provide an email address.`,
  
  // Email spelling confirmation (letter-by-letter for TTS)
  emailSpelling: (email: string) => 
    `Let me spell that back: ${spellEmailForTTS(email)}. Is that correct?`,
  
  emailCorrection: `I apologize for the confusion. Can you please provide your email address again, speaking slowly?`,
  
  emailRetry: `Let me try that again. Please spell out your email address letter by letter.`,
  
  // Error handling prompts
  invalidState: `I need a valid two-letter state code. For example, C-A for California, N-Y for New York, or T-X for Texas.`,
  
  invalidZip: `I need a valid ZIP code. Please provide either five digits like 1-2-3-4-5, or nine digits like 1-2-3-4-5 dash 6-7-8-9.`,
  
  invalidEmail: `That doesn't appear to be a valid email address. Please provide an email in the format like user at example dot com.`,
  
  incompleteAddress: `I need your complete address. Please provide your street address, city, state, and ZIP code.`,
  
  // Completion and transition
  contactComplete: `Perfect! I have your complete contact information. Now let's move on to some financial information.`,
  
  contactCompleteNoEmail: `Perfect! I have your complete address information. Now let's move on to some financial information.`,
  
  // Clarification prompts
  clarifyStreet: `I need your street address with the house or building number. For example, 1-2-3 Main Street.`,
  
  clarifyCity: `What city is your address in?`,
  
  clarifyState: `What state is that in? Please give me the two-letter abbreviation.`,
  
  clarifyZip: `What is your ZIP code? Please provide the five-digit number.`,
  
  // Retry prompts for failed attempts
  retryAddress: `Let me try collecting your address again. Please provide your complete mailing address.`,
  
  retryEmail: `Let me try collecting your email again. Please provide your email address, or say "no email" if you prefer not to provide one.`
};

/**
 * Generate dynamic prompts based on context and state
 * 
 * Requirements: R3.1, R3.3, R3.4
 */
export class ContactPromptGenerator {
  /**
   * Generate address confirmation prompt with proper TTS formatting
   * 
   * Requirements: R3.1, R3.3
   */
  static generateAddressConfirmation(address: AddressData): string {
    return CONTACT_PROMPTS.addressConfirmation(address);
  }

  /**
   * Generate email spelling confirmation prompt
   * 
   * Requirements: R3.2
   */
  static generateEmailSpelling(email: string): string {
    return CONTACT_PROMPTS.emailSpelling(email);
  }

  /**
   * Generate unit number confirmation prompt
   * 
   * Requirements: R3.1, R3.3
   */
  static generateUnitConfirmation(unitNumber: string): string {
    return CONTACT_PROMPTS.unitConfirmation(unitNumber);
  }

  /**
   * Generate error-specific retry prompt
   * 
   * Requirements: R3.4
   */
  static generateErrorPrompt(errorCode: string, field?: string): string {
    switch (errorCode) {
      case 'INVALID_STATE_CODE':
        return CONTACT_PROMPTS.invalidState;
      case 'INVALID_ZIP_FORMAT':
        return CONTACT_PROMPTS.invalidZip;
      case 'INVALID_EMAIL_FORMAT':
        return CONTACT_PROMPTS.invalidEmail;
      case 'ADDRESS_INCOMPLETE':
        return CONTACT_PROMPTS.incompleteAddress;
      case 'EMAIL_CONFIRMATION_FAILED':
        return CONTACT_PROMPTS.emailCorrection;
      default:
        if (field === 'email') {
          return CONTACT_PROMPTS.retryEmail;
        } else if (field === 'address') {
          return CONTACT_PROMPTS.retryAddress;
        }
        return CONTACT_PROMPTS.retryAddress;
    }
  }

  /**
   * Generate field-specific clarification prompt
   * 
   * Requirements: R3.4
   */
  static generateClarificationPrompt(field: string): string {
    switch (field) {
      case 'street':
        return CONTACT_PROMPTS.clarifyStreet;
      case 'city':
        return CONTACT_PROMPTS.clarifyCity;
      case 'state':
        return CONTACT_PROMPTS.clarifyState;
      case 'zipCode':
        return CONTACT_PROMPTS.clarifyZip;
      default:
        return CONTACT_PROMPTS.completeAddressRequest;
    }
  }

  /**
   * Generate completion prompt based on collected data
   * 
   * Requirements: R3.4
   */
  static generateCompletionPrompt(hasEmail: boolean): string {
    return hasEmail 
      ? CONTACT_PROMPTS.contactComplete 
      : CONTACT_PROMPTS.contactCompleteNoEmail;
  }
}

/**
 * Conversation flow logic for contact information collection
 * 
 * Requirements: R3.1, R3.2, R3.3, R3.4
 */
export class ContactConversationFlow {
  /**
   * Determine next prompt based on current state and collected data
   * 
   * Requirements: R3.4
   */
  static getNextPrompt(
    collectedData: Partial<AddressData>,
    hasEmail: boolean,
    unitNumberAsked: boolean,
    lastError?: string
  ): string {
    // Handle error recovery first
    if (lastError) {
      return ContactPromptGenerator.generateErrorPrompt(lastError);
    }

    // Check for missing address components
    if (!collectedData.street) {
      return CONTACT_PROMPTS.clarifyStreet;
    }
    if (!collectedData.city) {
      return CONTACT_PROMPTS.clarifyCity;
    }
    if (!collectedData.state) {
      return CONTACT_PROMPTS.clarifyState;
    }
    if (!collectedData.zipCode) {
      return CONTACT_PROMPTS.clarifyZip;
    }

    // Check if unit number needs to be asked
    if (!unitNumberAsked && this.needsUnitNumber(collectedData.street || '')) {
      return CONTACT_PROMPTS.unitNumberRequest;
    }

    // Address is complete, move to email if not collected
    if (!hasEmail) {
      return CONTACT_PROMPTS.emailRequest;
    }

    // Everything is complete
    return ContactPromptGenerator.generateCompletionPrompt(hasEmail);
  }

  /**
   * Check if address likely needs unit number
   * 
   * Requirements: R3.1
   */
  private static needsUnitNumber(street: string): boolean {
    const multiUnitIndicators = [
      'apartment', 'apt', 'suite', 'ste', 'unit', 'building', 'bldg',
      'floor', 'fl', '#', 'number', 'no'
    ];

    const lowerStreet = street.toLowerCase();
    return multiUnitIndicators.some(indicator => lowerStreet.includes(indicator));
  }

  /**
   * Generate appropriate confirmation prompt for collected data
   * 
   * Requirements: R3.1, R3.2, R3.3
   */
  static generateConfirmationPrompt(
    address: AddressData,
    email?: string
  ): string {
    const addressConfirmation = ContactPromptGenerator.generateAddressConfirmation(address);
    
    if (email) {
      const emailSpelling = ContactPromptGenerator.generateEmailSpelling(email);
      return `${addressConfirmation} And your email is: ${emailSpelling}`;
    }
    
    return addressConfirmation;
  }
}

/**
 * Voice-specific formatting utilities for prompts
 * 
 * Requirements: R3.1, R3.2, R3.3
 */
export class VoicePromptFormatter {
  /**
   * Add natural pauses to prompts for better TTS delivery
   * 
   * Requirements: R3.1, R3.3
   */
  static addTTSPauses(prompt: string): string {
    return prompt
      .replace(/\. /g, '.  ')  // Double space after sentences
      .replace(/\? /g, '?  ')  // Double space after questions
      .replace(/: /g, ':  ')   // Double space after colons
      .replace(/; /g, ';  ');  // Double space after semicolons
  }

  /**
   * Format numbers and codes for clear TTS pronunciation
   * 
   * Requirements: R3.1, R3.3
   */
  static formatForTTS(text: string): string {
    return text
      .replace(/\b(\d{5}(-\d{4})?)\b/g, (match) => formatZipForTTS(match))
      .replace(/\b([A-Z]{2})\b/g, (match) => match.split('').join('-'));
  }

  /**
   * Ensure prompt is optimized for voice delivery
   * 
   * Requirements: R3.1, R3.2, R3.3, R3.4
   */
  static optimizeForVoice(prompt: string): string {
    let optimized = this.addTTSPauses(prompt);
    optimized = this.formatForTTS(optimized);
    return optimized.trim();
  }
}