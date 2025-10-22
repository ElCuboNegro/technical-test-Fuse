/**
 * Error Handling Utilities
 * 
 * Provides error handling, error code generation, and recovery utilities
 * for the contact information node.
 * 
 * Requirements: R5.1, R5.2, R5.3, R5.4
 */

export enum ContactErrorCode {
  IDENTITY_NOT_VERIFIED = 'IDENTITY_NOT_VERIFIED',
  ADDRESS_INCOMPLETE = 'ADDRESS_INCOMPLETE',
  INVALID_STATE_CODE = 'INVALID_STATE_CODE',
  INVALID_ZIP_FORMAT = 'INVALID_ZIP_FORMAT',
  INVALID_EMAIL_FORMAT = 'INVALID_EMAIL_FORMAT',
  EMAIL_CONFIRMATION_FAILED = 'EMAIL_CONFIRMATION_FAILED',
  CONTACT_COLLECTION_ERROR = 'CONTACT_COLLECTION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  INVALID_STATE = 'INVALID_STATE'
}

export interface ContactError {
  code: ContactErrorCode;
  recoverable: boolean;
  message: string;
  field?: string;
  formatExample?: string;
}

export interface ValidationErrorResult {
  lastError: ContactError;
  needs: {
    identity: boolean;
    contact: boolean;
    financial: boolean;
    confirm: boolean;
  };
}

export interface PrerequisiteValidationResult {
  valid: boolean;
  error?: ContactError;
}

export interface ContactState {
  identityVerified?: boolean;
  needs?: {
    identity: boolean;
    contact: boolean;
    financial: boolean;
    confirm: boolean;
  };
}

/**
 * Create a contact error with appropriate recovery information
 * 
 * Requirements: R5.1, R5.2
 */
export function createContactError(
  code: ContactErrorCode,
  message: string,
  field?: string
): ContactError {
  const error: ContactError = {
    code,
    recoverable: isRecoverableError(code),
    message,
    field
  };

  // Add format examples for validation errors
  switch (code) {
    case ContactErrorCode.INVALID_STATE_CODE:
      error.formatExample = 'CA, NY, TX, FL';
      break;
    case ContactErrorCode.INVALID_ZIP_FORMAT:
      error.formatExample = '12345 or 12345-6789';
      break;
    case ContactErrorCode.INVALID_EMAIL_FORMAT:
      error.formatExample = 'user@example.com';
      break;
  }

  return error;
}

/**
 * Handle validation errors with specific error codes and recovery information
 * 
 * Requirements: R5.1, R5.3
 */
export function handleValidationError(
  field: 'state' | 'zipCode' | 'email' | 'address' | string,
  value: any
): ValidationErrorResult {
  let errorCode: ContactErrorCode;
  let message: string;

  switch (field) {
    case 'state':
      errorCode = ContactErrorCode.INVALID_STATE_CODE;
      message = `Invalid state code: ${value}`;
      break;
    case 'zipCode':
      errorCode = ContactErrorCode.INVALID_ZIP_FORMAT;
      message = `Invalid ZIP code format: ${value}`;
      break;
    case 'email':
      errorCode = ContactErrorCode.INVALID_EMAIL_FORMAT;
      message = `Invalid email format: ${value}`;
      break;
    case 'address':
      errorCode = ContactErrorCode.ADDRESS_INCOMPLETE;
      message = 'Address information is incomplete';
      break;
    default:
      errorCode = ContactErrorCode.VALIDATION_ERROR;
      message = `Validation error for field: ${field}`;
      break;
  }

  const error = createContactError(errorCode, message, field);

  return {
    lastError: error,
    needs: {
      identity: false,
      contact: true,
      financial: false,
      confirm: false
    }
  };
}

/**
 * Determine if an error code represents a recoverable error
 * 
 * Requirements: R5.2
 */
export function isRecoverableError(code: ContactErrorCode): boolean {
  const nonRecoverableErrors = [
    ContactErrorCode.IDENTITY_NOT_VERIFIED,
    ContactErrorCode.SYSTEM_ERROR,
    ContactErrorCode.INVALID_STATE
  ];

  // Default to recoverable for unknown errors
  return !nonRecoverableErrors.includes(code);
}

/**
 * Get user-friendly error message for display
 * 
 * Requirements: R5.3
 */
export function getErrorMessage(code: ContactErrorCode): string {
  const messages: Record<ContactErrorCode, string> = {
    [ContactErrorCode.IDENTITY_NOT_VERIFIED]: 'Identity verification is required to proceed.',
    [ContactErrorCode.ADDRESS_INCOMPLETE]: 'Please provide your complete address.',
    [ContactErrorCode.INVALID_STATE_CODE]: 'Please provide a valid 2-letter state code.',
    [ContactErrorCode.INVALID_ZIP_FORMAT]: 'Please provide a valid ZIP code.',
    [ContactErrorCode.INVALID_EMAIL_FORMAT]: 'Please provide a valid email address.',
    [ContactErrorCode.EMAIL_CONFIRMATION_FAILED]: 'Let me try spelling that email again.',
    [ContactErrorCode.CONTACT_COLLECTION_ERROR]: 'There was an error collecting your contact information. Please try again.',
    [ContactErrorCode.VALIDATION_ERROR]: 'Please check your information and try again.',
    [ContactErrorCode.SYSTEM_ERROR]: 'A system error occurred. Please try again.',
    [ContactErrorCode.INVALID_STATE]: 'Invalid system state detected.'
  };

  return messages[code] || 'An error occurred. Please try again.';
}

/**
 * Validate prerequisites before contact collection
 * 
 * Requirements: R5.4
 */
export function validatePrerequisites(state: ContactState): PrerequisiteValidationResult {
  if (!state) {
    return {
      valid: false,
      error: createContactError(
        ContactErrorCode.INVALID_STATE,
        'Invalid system state'
      )
    };
  }

  if (!state.identityVerified || state.needs?.identity) {
    return {
      valid: false,
      error: createContactError(
        ContactErrorCode.IDENTITY_NOT_VERIFIED,
        'Identity must be verified before collecting contact information'
      )
    };
  }

  return { valid: true };
}