/**
 * Contact Node State Management Utilities
 * 
 * Provides state management, routing flags, and progress tracking
 * for the contact information node.
 * 
 * Requirements: R4.1, R4.2, R4.3, R4.4, R5.1, R5.2, R5.3, R5.4
 */

import { ContactErrorCode, ContactError } from './error-handling';

export interface AddressData {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  unitNumber?: string;
}

export interface ContactData {
  address: AddressData;
  email?: string;
}

export interface ContactProgress {
  addressComplete: boolean;
  emailComplete: boolean;
  unitNumberAsked: boolean;
  emailConfirmationAttempts?: number;
  needsEmailCorrection?: boolean;
}

export interface ContactState {
  // Prerequisites (must be true to proceed)
  identityVerified: boolean;
  
  // Collected contact data
  collected: {
    contact?: ContactData;
  };
  
  // Flow control flags (routing to next steps)
  needs: {
    identity: boolean;
    contact: boolean;
    financial: boolean;
    confirm: boolean;
  };
  
  // Collection progress tracking
  contactProgress?: ContactProgress;
  
  // Error handling
  lastError?: ContactError | null;
}

export interface StateUpdateResult {
  success: boolean;
  newState: Partial<ContactState>;
  routingFlags: {
    identity: boolean;
    contact: boolean;
    financial: boolean;
    confirm: boolean;
  };
  error?: ContactError;
}

/**
 * Update state with collected contact data and set routing flags
 * 
 * Requirements: R4.1, R4.2, R4.3, R4.4
 */
export function updateContactState(
  currentState: ContactState,
  contactData: ContactData
): StateUpdateResult {
  try {
    // Validate prerequisites
    if (!currentState.identityVerified) {
      const error: ContactError = {
        code: ContactErrorCode.IDENTITY_NOT_VERIFIED,
        recoverable: false,
        message: 'Identity verification is required before collecting contact information'
      };
      
      return {
        success: false,
        newState: {
          lastError: error
        },
        routingFlags: {
          identity: true,
          contact: false,
          financial: false,
          confirm: false
        },
        error
      };
    }

    // Update collected data
    const newState: Partial<ContactState> = {
      collected: {
        ...currentState.collected,
        contact: contactData
      },
      needs: {
        identity: false,
        contact: false,
        financial: true,
        confirm: false
      },
      contactProgress: {
        addressComplete: true,
        emailComplete: true,
        unitNumberAsked: true,
        emailConfirmationAttempts: currentState.contactProgress?.emailConfirmationAttempts || 0
      },
      lastError: null
    };

    return {
      success: true,
      newState,
      routingFlags: {
        identity: false,
        contact: false,
        financial: true,
        confirm: false
      }
    };
  } catch (error) {
    const contactError: ContactError = {
      code: ContactErrorCode.SYSTEM_ERROR,
      recoverable: true,
      message: error instanceof Error ? error.message : 'Unknown system error'
    };

    return {
      success: false,
      newState: {
        lastError: contactError,
        needs: {
          ...currentState.needs,
          contact: true
        }
      },
      routingFlags: {
        identity: false,
        contact: true,
        financial: false,
        confirm: false
      },
      error: contactError
    };
  }
}

/**
 * Update state for retry scenarios with error information
 * 
 * Requirements: R5.1, R5.2, R5.3
 */
export function updateStateForRetry(
  currentState: ContactState,
  error: ContactError,
  field?: string
): StateUpdateResult {
  const newState: Partial<ContactState> = {
    lastError: error,
    needs: {
      ...currentState.needs,
      contact: true
    }
  };

  // Update progress tracking based on error type
  if (error.code === ContactErrorCode.EMAIL_CONFIRMATION_FAILED) {
    const currentAttempts = currentState.contactProgress?.emailConfirmationAttempts || 0;
    newState.contactProgress = {
      ...currentState.contactProgress,
      addressComplete: currentState.contactProgress?.addressComplete || false,
      emailComplete: false,
      unitNumberAsked: currentState.contactProgress?.unitNumberAsked || false,
      emailConfirmationAttempts: currentAttempts + 1,
      needsEmailCorrection: currentAttempts > 0
    };
  }

  return {
    success: false,
    newState,
    routingFlags: {
      identity: false,
      contact: true,
      financial: false,
      confirm: false
    },
    error
  };
}

/**
 * Update progress tracking to prevent duplicate requests
 * 
 * Requirements: R4.4
 */
export function updateContactProgress(
  currentState: ContactState,
  progressUpdate: Partial<ContactProgress>
): Partial<ContactState> {
  return {
    contactProgress: {
      addressComplete: false,
      emailComplete: false,
      unitNumberAsked: false,
      ...currentState.contactProgress,
      ...progressUpdate
    }
  };
}

/**
 * Check if contact collection is complete
 * 
 * Requirements: R4.1, R4.2
 */
export function isContactCollectionComplete(state: ContactState): boolean {
  const contact = state.collected?.contact;
  if (!contact) {
    return false;
  }

  // Address must be complete
  if (!contact.address || 
      !contact.address.street || 
      !contact.address.city || 
      !contact.address.state || 
      !contact.address.zipCode) {
    return false;
  }

  // Email is optional, so collection is complete regardless
  return true;
}

/**
 * Determine next routing based on current state
 * 
 * Requirements: R4.3
 */
export function determineNextRouting(state: ContactState): {
  identity: boolean;
  contact: boolean;
  financial: boolean;
  confirm: boolean;
} {
  // Prerequisites check
  if (!state.identityVerified) {
    return {
      identity: true,
      contact: false,
      financial: false,
      confirm: false
    };
  }

  // Contact collection incomplete
  if (!isContactCollectionComplete(state)) {
    return {
      identity: false,
      contact: true,
      financial: false,
      confirm: false
    };
  }

  // Contact complete, move to financial
  return {
    identity: false,
    contact: false,
    financial: true,
    confirm: false
  };
}

/**
 * Create telemetry event with proper redaction
 * 
 * Requirements: R6.1, R6.2, R6.3, R6.4
 */
export function createContactTelemetryEvent(
  eventType: string,
  success: boolean,
  contactData?: ContactData,
  error?: ContactError,
  sessionId?: string,
  userId?: string
): any {
  const baseEvent = {
    node: 'contact',
    eventType,
    success,
    timestamp: new Date().toISOString(),
    sessionId,
    userId
  };

  if (error) {
    baseEvent.error = {
      code: error.code,
      recoverable: error.recoverable,
      field: error.field
    };
  }

  if (contactData) {
    // Redacted data for telemetry
    baseEvent.redactedData = {
      addressProvided: !!contactData.address,
      emailProvided: !!contactData.email,
      hasUnitNumber: !!contactData.address?.unitNumber,
      // State is not PII, safe to include for analytics
      state: contactData.address?.state,
      // ZIP first 3 digits for regional analytics
      zipRegion: contactData.address?.zipCode?.substring(0, 3),
      // Email domain for analytics (if common domain)
      emailDomain: contactData.email ? getEmailDomainForAnalytics(contactData.email) : undefined
    };
  }

  return baseEvent;
}

/**
 * Get email domain for analytics (only common domains)
 * 
 * Requirements: R6.4
 */
function getEmailDomainForAnalytics(email: string): string | undefined {
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1) {
    return undefined;
  }

  const domain = email.substring(atIndex + 1).toLowerCase();
  
  // Only include common consumer domains for analytics
  const commonDomains = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'aol.com', 'icloud.com', 'comcast.net', 'verizon.net'
  ];
  
  return commonDomains.includes(domain) ? domain : 'other';
}

/**
 * Validate state consistency and detect issues
 * 
 * Requirements: R5.4
 */
export function validateStateConsistency(state: ContactState): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check prerequisites
  if (!state.identityVerified && state.needs?.contact) {
    issues.push('Contact collection requested without identity verification');
  }

  // Check progress consistency
  if (state.contactProgress?.addressComplete && !state.collected?.contact?.address) {
    issues.push('Address marked complete but no address data found');
  }

  if (state.contactProgress?.emailComplete && state.needs?.contact) {
    issues.push('Email marked complete but contact still needed');
  }

  // Check routing consistency
  if (state.needs?.financial && !isContactCollectionComplete(state)) {
    issues.push('Financial step requested but contact collection incomplete');
  }

  return {
    valid: issues.length === 0,
    issues
  };
}