/**
 * State Management & Routing Flags Utilities
 * 
 * Provides utilities for managing conversation state, routing flags, and progress tracking
 * for the contact information node.
 * 
 * Requirements: R4.1, R4.2, R4.3, R4.4
 */

export interface ContactData {
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    unitNumber?: string;
  };
  email?: string;
}

export interface ContactProgress {
  addressComplete: boolean;
  emailComplete: boolean;
  unitNumberAsked: boolean;
  emailConfirmationAttempts?: number;
  needsEmailCorrection?: boolean;
}

export interface RoutingFlags {
  identity: boolean;
  contact: boolean;
  financial: boolean;
  confirm: boolean;
}

export interface ContactState {
  collected: {
    contact: ContactData;
  };
  needs: RoutingFlags;
  contactProgress: ContactProgress;
}

export interface StateTransitionResult {
  valid: boolean;
  error?: string;
}

export type NextStep = 'identity' | 'contact' | 'financial' | 'confirm';

/**
 * Update contact state with new contact data and set appropriate routing flags
 * 
 * Requirements: R4.1, R4.2
 */
export function updateContactState(
  currentState: Partial<ContactState>,
  contactData: ContactData
): Partial<ContactState> {
  const hasAddress = contactData.address && 
    contactData.address.street &&
    contactData.address.city &&
    contactData.address.state &&
    contactData.address.zipCode;

  const hasEmail = contactData.email !== undefined;
  const emailComplete = !hasEmail || (hasEmail && !!contactData.email); // No email or valid email = complete

  const addressComplete = !!hasAddress;
  const unitNumberAsked = true; // Always mark as asked when updating state

  const isComplete = addressComplete && emailComplete;

  return {
    ...currentState,
    collected: {
      ...currentState.collected,
      contact: {
        ...currentState.collected?.contact,
        ...contactData
      }
    },
    needs: isComplete ? setRoutingFlags('financial') : setRoutingFlags('contact'),
    contactProgress: {
      ...currentState.contactProgress,
      addressComplete,
      emailComplete,
      unitNumberAsked
    }
  };
}

/**
 * Set routing flags for the next step in the conversation flow
 * 
 * Requirements: R4.3
 */
export function setRoutingFlags(nextStep: NextStep): RoutingFlags {
  const flags: RoutingFlags = {
    identity: false,
    contact: false,
    financial: false,
    confirm: false
  };

  switch (nextStep) {
    case 'identity':
      flags.identity = true;
      break;
    case 'contact':
      flags.contact = true;
      break;
    case 'financial':
      flags.financial = true;
      break;
    case 'confirm':
      flags.confirm = true;
      break;
    default:
      // Default to contact if invalid step
      flags.contact = true;
      break;
  }

  return flags;
}

/**
 * Validate that a state transition is allowed
 * 
 * Requirements: R4.4
 */
export function validateStateTransition(
  currentState: Partial<ContactState>,
  targetStep: NextStep
): StateTransitionResult {
  // Check if identity is verified for any step beyond identity
  if (targetStep !== 'identity' && currentState.needs?.identity) {
    return {
      valid: false,
      error: 'IDENTITY_NOT_VERIFIED'
    };
  }

  // Check if contact is complete for financial step
  if (targetStep === 'financial') {
    if (currentState.needs?.contact || !isContactComplete(currentState.contactProgress)) {
      return {
        valid: false,
        error: 'CONTACT_INCOMPLETE'
      };
    }
  }

  // Check if financial is complete for confirmation step
  if (targetStep === 'confirm') {
    if (currentState.needs?.financial) {
      return {
        valid: false,
        error: 'FINANCIAL_INCOMPLETE'
      };
    }
  }

  return { valid: true };
}

/**
 * Check if contact collection is complete
 * 
 * Requirements: R4.1
 */
export function isContactComplete(progress?: ContactProgress): boolean {
  if (!progress) {
    return false;
  }

  return progress.addressComplete && 
         progress.emailComplete && 
         progress.unitNumberAsked;
}

/**
 * Determine the next step based on current state
 * 
 * Requirements: R4.3, R4.4
 */
export function getNextStep(state: Partial<ContactState>): NextStep {
  if (state.needs?.identity) {
    return 'identity';
  }

  if (state.needs?.contact) {
    return 'contact';
  }

  if (state.needs?.financial) {
    return 'financial';
  }

  if (state.needs?.confirm) {
    return 'confirm';
  }

  // Default fallback
  return 'contact';
}

/**
 * Reset contact progress to initial state
 * 
 * Requirements: R4.2
 */
export function resetContactProgress(
  currentProgress?: ContactProgress
): ContactProgress {
  const baseProgress: ContactProgress = {
    addressComplete: false,
    emailComplete: false,
    unitNumberAsked: false
  };

  if (!currentProgress) {
    return baseProgress;
  }

  // Reset core flags and preserve/reset other properties
  const resetProgress = { ...baseProgress };
  
  // Add emailConfirmationAttempts if it exists in current progress
  if (currentProgress.emailConfirmationAttempts !== undefined) {
    resetProgress.emailConfirmationAttempts = 0;
  }

  // Add other properties from current progress, resetting them appropriately
  Object.entries(currentProgress).forEach(([key, value]) => {
    if (!['addressComplete', 'emailComplete', 'unitNumberAsked', 'emailConfirmationAttempts'].includes(key)) {
      (resetProgress as any)[key] = typeof value === 'number' ? 0 : false;
    }
  });

  return resetProgress;
}

/**
 * Merge contact progress updates with current progress
 * 
 * Requirements: R4.2
 */
export function mergeContactProgress(
  currentProgress?: ContactProgress,
  updates?: Partial<ContactProgress>
): ContactProgress {
  const defaultProgress: ContactProgress = {
    addressComplete: false,
    emailComplete: false,
    unitNumberAsked: false
  };

  return {
    ...defaultProgress,
    ...currentProgress,
    ...updates
  };
}