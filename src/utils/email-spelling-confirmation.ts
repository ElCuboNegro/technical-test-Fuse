/**
 * Email Spelling Confirmation Utilities
 * 
 * Provides letter-by-letter email spelling confirmation functionality
 * for voice/TTS interfaces.
 * 
 * Requirements: R2.3, R2.4, R3.2
 */

import { normalizeEmail } from './email-validation';

export interface EmailConfirmationResult {
  confirmed: boolean;
  spelledEmail: string;
  needsCorrection?: boolean;
  error?: string;
}

export interface EmailConfirmationState {
  collected: {
    contact: {
      email?: string;
    };
  };
  needs: {
    contact: boolean;
  };
  lastError?: {
    code: string;
  } | null;
  contactProgress?: {
    emailConfirmationAttempts?: number;
    needsEmailCorrection?: boolean;
  };
}

/**
 * Spell email address letter-by-letter for TTS
 * 
 * Requirements: R3.2
 */
export function spellEmailForTTS(email: string): string {
  if (!email || typeof email !== 'string') {
    return '';
  }

  // First, replace special characters with words
  let processed = email
    .replace('@', ' at ')
    .replace(/\./g, ' dot ')
    .replace(/\+/g, ' plus ')
    .replace(/-/g, ' dash ')
    .replace(/_/g, ' underscore ');

  // Split into parts, preserving the special words
  const parts = processed.split(/(\s+(?:at|dot|plus|dash|underscore)\s+)/);
  
  const result = parts.map(part => {
    // If this is a special word (at, dot, plus, dash, underscore), keep it as is
    if (/^\s*(at|dot|plus|dash|underscore)\s*$/.test(part)) {
      return part.trim();
    }
    
    // Otherwise, spell out the characters, handling numbers specially
    const chars = part.split('').filter(char => char !== ' ');
    const spelledChars: string[] = [];
    
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      
      if (/\d/.test(char)) {
        // For numbers, add space before if previous char was a letter
        if (i > 0 && /[a-zA-Z]/.test(chars[i - 1])) {
          spelledChars.push(' ' + char);
        } else {
          spelledChars.push(char);
        }
        
        // Add dash after number if next char is a number
        if (i < chars.length - 1 && /\d/.test(chars[i + 1])) {
          spelledChars.push('-');
        }
        // Add space after number if next char is a letter
        else if (i < chars.length - 1 && /[a-zA-Z]/.test(chars[i + 1])) {
          spelledChars.push(' ');
        }
      } else {
        // For letters, just add the character
        spelledChars.push(char);
        
        // Add dash after letter if next char is a letter
        if (i < chars.length - 1 && /[a-zA-Z]/.test(chars[i + 1])) {
          spelledChars.push('-');
        }
      }
    }
    
    return spelledChars.join('');
  }).filter(part => part.length > 0);

  return result.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Format email spelling with proper TTS pauses and clarity
 * 
 * Requirements: R3.2
 */
export function formatEmailSpelling(email: string): string {
  const spelledEmail = spellEmailForTTS(email);
  
  // Add double spaces around key separators for TTS pauses
  return spelledEmail
    .replace(/ at /g, '  at  ')
    .replace(/ dot /g, '  dot  ')
    .replace(/ plus /g, '  plus  ')
    .replace(/ dash /g, '  dash  ')
    .replace(/ underscore /g, '  underscore  ');
}

/**
 * Confirm email spelling with user via callback
 * 
 * Requirements: R2.3, R2.4
 */
export async function confirmEmailSpelling(
  email: string,
  confirmationCallback: (prompt: string) => Promise<boolean>
): Promise<EmailConfirmationResult> {
  try {
    const spelledEmail = spellEmailForTTS(email);
    const formattedSpelling = formatEmailSpelling(email);
    
    const prompt = `Let me spell that back: ${formattedSpelling}. Is that correct?`;
    const confirmed = await confirmationCallback(prompt);
    
    return {
      confirmed,
      spelledEmail,
      needsCorrection: !confirmed
    };
  } catch (error) {
    return {
      confirmed: false,
      spelledEmail: spellEmailForTTS(email),
      needsCorrection: true,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Handle complete email confirmation workflow with state management
 * 
 * Requirements: R2.3, R2.4, R3.2
 */
export async function handleEmailConfirmation(
  email: string,
  currentState: EmailConfirmationState,
  confirmationCallback: (prompt: string) => Promise<boolean>
): Promise<Partial<EmailConfirmationState>> {
  try {
    const normalizedEmail = normalizeEmail(email);
    const confirmationResult = await confirmEmailSpelling(normalizedEmail, confirmationCallback);
    
    const currentAttempts = currentState.contactProgress?.emailConfirmationAttempts || 0;
    const newAttempts = currentAttempts + 1;
    
    if (confirmationResult.confirmed) {
      // Email confirmed successfully
      return {
        collected: {
          ...currentState.collected,
          contact: {
            ...currentState.collected.contact,
            email: normalizedEmail
          }
        },
        needs: {
          ...currentState.needs,
          contact: false
        },
        lastError: null,
        contactProgress: {
          ...currentState.contactProgress,
          emailConfirmationAttempts: newAttempts
        }
      };
    } else {
      // Email confirmation failed
      return {
        lastError: {
          code: 'EMAIL_CONFIRMATION_FAILED'
        },
        needs: {
          ...currentState.needs,
          contact: true
        },
        contactProgress: {
          ...currentState.contactProgress,
          emailConfirmationAttempts: newAttempts,
          needsEmailCorrection: newAttempts > 1
        }
      };
    }
  } catch (error) {
    return {
      lastError: {
        code: 'EMAIL_CONFIRMATION_ERROR'
      },
      needs: {
        ...currentState.needs,
        contact: true
      }
    };
  }
}