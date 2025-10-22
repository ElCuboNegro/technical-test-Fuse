/**
 * Contact Node Error Classification and Recovery
 * 
 * Provides comprehensive error classification, specific error codes,
 * and recovery strategies for the contact information node.
 * 
 * Requirements: R5.1, R5.2, R5.3, R5.4
 */

export enum ContactErrorCode {
  // Prerequisites
  IDENTITY_NOT_VERIFIED = 'IDENTITY_NOT_VERIFIED',
  INVALID_STATE = 'INVALID_STATE',
  
  // Address validation errors
  ADDRESS_INCOMPLETE = 'ADDRESS_INCOMPLETE',
  INVALID_STATE_CODE = 'INVALID_STATE_CODE',
  INVALID_ZIP_FORMAT = 'INVALID_ZIP_FORMAT',
  MISSING_STREET = 'MISSING_STREET',
  MISSING_CITY = 'MISSING_CITY',
  MISSING_STATE = 'MISSING_STATE',
  MISSING_ZIP = 'MISSING_ZIP',
  
  // Email validation errors
  INVALID_EMAIL_FORMAT = 'INVALID_EMAIL_FORMAT',
  EMAIL_CONFIRMATION_FAILED = 'EMAIL_CONFIRMATION_FAILED',
  EMAIL_CONFIRMATION_ERROR = 'EMAIL_CONFIRMATION_ERROR',
  
  // System errors
  CONTACT_COLLECTION_ERROR = 'CONTACT_COLLECTION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  PERSISTENCE_ERROR = 'PERSISTENCE_ERROR',
  
  // Extraction errors
  EXTRACTION_FAILED = 'EXTRACTION_FAILED',
  SCHEMA_VALIDATION_FAILED = 'SCHEMA_VALIDATION_FAILED'
}

export interface ContactError {
  code: ContactErrorCode;
  recoverable: boolean;
  message: string;
  field?: string;
  formatExample?: string;
  retryable: boolean;
  maxRetries?: number;
}

export interface ErrorClassificationResult {
  error: ContactError;
  recoveryStrategy: RecoveryStrategy;
  nextAction: NextAction;
}

export enum RecoveryStrategy {
  RETRY_SAME_FIELD = 'RETRY_SAME_FIELD',
  RETRY_WITH_CLARIFICATION = 'RETRY_WITH_CLARIFICATION',
  RETRY_WITH_EXAMPLE = 'RETRY_WITH_EXAMPLE',
  SKIP_OPTIONAL_FIELD = 'SKIP_OPTIONAL_FIELD',
  TERMINATE_COLLECTION = 'TERMINATE_COLLECTION',
  SYSTEM_RECOVERY = 'SYSTEM_RECOVERY'
}

export enum NextAction {
  PROMPT_RETRY = 'PROMPT_RETRY',
  PROVIDE_CLARIFICATION = 'PROVIDE_CLARIFICATION',
  SHOW_FORMAT_EXAMPLE = 'SHOW_FORMAT_EXAMPLE',
  CONTINUE_WITHOUT_FIELD = 'CONTINUE_WITHOUT_FIELD',
  ROUTE_TO_TERMINATION = 'ROUTE_TO_TERMINATION',
  RETRY_SYSTEM_OPERATION = 'RETRY_SYSTEM_OPERATION'
}

/**
 * Classify error and determine recovery strategy
 * 
 * Requirements: R5.1, R5.2
 */
export function classifyContactError(
  errorCode: ContactErrorCode,
  field?: string,
  attemptCount: number = 1
): ErrorClassificationResult {
  const error = createContactError(errorCode, field, attemptCount);
  const recoveryStrategy = determineRecoveryStrategy(errorCode, field, attemptCount);
  const nextAction = determineNextAction(errorCode, field, attemptCount);

  return {
    error,
    recoveryStrategy,
    nextAction
  };
}

/**
 * Create detailed contact error with recovery information
 * 
 * Requirements: R5.1, R5.2
 */
export function createContactError(
  code: ContactErrorCode,
  field?: string,
  attemptCount: number = 1
): ContactError {
  const errorDefinitions: Record<ContactErrorCode, Partial<ContactError>> = {
    [ContactErrorCode.IDENTITY_NOT_VERIFIED]: {
      recoverable: false,
      message: 'Identity verification is required to proceed',
      retryable: false
    },
    [ContactErrorCode.INVALID_STATE]: {
      recoverable: false,
      message: 'Invalid system state detected',
      retryable: false
    },
    [ContactErrorCode.ADDRESS_INCOMPLETE]: {
      recoverable: true,
      message: 'Address information is incomplete',
      retryable: true,
      maxRetries: 3
    },
    [ContactErrorCode.INVALID_STATE_CODE]: {
      recoverable: true,
      message: 'Invalid state code provided',
      field: 'state',
      formatExample: 'CA, NY, TX, FL',
      retryable: true,
      maxRetries: 3
    },
    [ContactErrorCode.INVALID_ZIP_FORMAT]: {
      recoverable: true,
      message: 'Invalid ZIP code format',
      field: 'zipCode',
      formatExample: '12345 or 12345-6789',
      retryable: true,
      maxRetries: 3
    },
    [ContactErrorCode.MISSING_STREET]: {
      recoverable: true,
      message: 'Street address is required',
      field: 'street',
      retryable: true,
      maxRetries: 3
    },
    [ContactErrorCode.MISSING_CITY]: {
      recoverable: true,
      message: 'City is required',
      field: 'city',
      retryable: true,
      maxRetries: 3
    },
    [ContactErrorCode.MISSING_STATE]: {
      recoverable: true,
      message: 'State is required',
      field: 'state',
      formatExample: 'CA, NY, TX, FL',
      retryable: true,
      maxRetries: 3
    },
    [ContactErrorCode.MISSING_ZIP]: {
      recoverable: true,
      message: 'ZIP code is required',
      field: 'zipCode',
      formatExample: '12345 or 12345-6789',
      retryable: true,
      maxRetries: 3
    },
    [ContactErrorCode.INVALID_EMAIL_FORMAT]: {
      recoverable: true,
      message: 'Invalid email format',
      field: 'email',
      formatExample: 'user@example.com',
      retryable: true,
      maxRetries: 3
    },
    [ContactErrorCode.EMAIL_CONFIRMATION_FAILED]: {
      recoverable: true,
      message: 'Email spelling confirmation failed',
      field: 'email',
      retryable: true,
      maxRetries: 2
    },
    [ContactErrorCode.EMAIL_CONFIRMATION_ERROR]: {
      recoverable: true,
      message: 'Error during email confirmation',
      field: 'email',
      retryable: true,
      maxRetries: 2
    },
    [ContactErrorCode.CONTACT_COLLECTION_ERROR]: {
      recoverable: true,
      message: 'Error collecting contact information',
      retryable: true,
      maxRetries: 2
    },
    [ContactErrorCode.VALIDATION_ERROR]: {
      recoverable: true,
      message: 'Validation error occurred',
      retryable: true,
      maxRetries: 3
    },
    [ContactErrorCode.SYSTEM_ERROR]: {
      recoverable: true,
      message: 'System error occurred',
      retryable: true,
      maxRetries: 2
    },
    [ContactErrorCode.PERSISTENCE_ERROR]: {
      recoverable: true,
      message: 'Error saving contact information',
      retryable: true,
      maxRetries: 2
    },
    [ContactErrorCode.EXTRACTION_FAILED]: {
      recoverable: true,
      message: 'Failed to extract contact information',
      retryable: true,
      maxRetries: 2
    },
    [ContactErrorCode.SCHEMA_VALIDATION_FAILED]: {
      recoverable: true,
      message: 'Contact data validation failed',
      retryable: true,
      maxRetries: 2
    }
  };

  const definition = errorDefinitions[code] || {
    recoverable: true,
    message: 'Unknown error occurred',
    retryable: true,
    maxRetries: 2
  };

  return {
    code,
    recoverable: definition.recoverable!,
    message: definition.message!,
    field: field || definition.field,
    formatExample: definition.formatExample,
    retryable: definition.retryable!,
    maxRetries: definition.maxRetries
  };
}

/**
 * Determine recovery strategy based on error type and context
 * 
 * Requirements: R5.2, R5.3
 */
export function determineRecoveryStrategy(
  errorCode: ContactErrorCode,
  field?: string,
  attemptCount: number = 1
): RecoveryStrategy {
  // Non-recoverable errors
  if (errorCode === ContactErrorCode.IDENTITY_NOT_VERIFIED || 
      errorCode === ContactErrorCode.INVALID_STATE) {
    return RecoveryStrategy.TERMINATE_COLLECTION;
  }

  // Email is optional, can skip after multiple failures
  if (field === 'email' && attemptCount > 2) {
    return RecoveryStrategy.SKIP_OPTIONAL_FIELD;
  }

  // Format validation errors need examples
  if (errorCode === ContactErrorCode.INVALID_STATE_CODE ||
      errorCode === ContactErrorCode.INVALID_ZIP_FORMAT ||
      errorCode === ContactErrorCode.INVALID_EMAIL_FORMAT) {
    return RecoveryStrategy.RETRY_WITH_EXAMPLE;
  }

  // Missing field errors need clarification
  if (errorCode === ContactErrorCode.MISSING_STREET ||
      errorCode === ContactErrorCode.MISSING_CITY ||
      errorCode === ContactErrorCode.MISSING_STATE ||
      errorCode === ContactErrorCode.MISSING_ZIP) {
    return RecoveryStrategy.RETRY_WITH_CLARIFICATION;
  }

  // Email confirmation errors
  if (errorCode === ContactErrorCode.EMAIL_CONFIRMATION_FAILED) {
    return attemptCount > 1 ? 
      RecoveryStrategy.SKIP_OPTIONAL_FIELD : 
      RecoveryStrategy.RETRY_WITH_CLARIFICATION;
  }

  // System errors
  if (errorCode === ContactErrorCode.SYSTEM_ERROR ||
      errorCode === ContactErrorCode.PERSISTENCE_ERROR) {
    return RecoveryStrategy.SYSTEM_RECOVERY;
  }

  // Default to retry with clarification
  return RecoveryStrategy.RETRY_WITH_CLARIFICATION;
}

/**
 * Determine next action based on recovery strategy
 * 
 * Requirements: R5.3, R5.4
 */
export function determineNextAction(
  errorCode: ContactErrorCode,
  field?: string,
  attemptCount: number = 1
): NextAction {
  const strategy = determineRecoveryStrategy(errorCode, field, attemptCount);

  switch (strategy) {
    case RecoveryStrategy.RETRY_SAME_FIELD:
      return NextAction.PROMPT_RETRY;
    case RecoveryStrategy.RETRY_WITH_CLARIFICATION:
      return NextAction.PROVIDE_CLARIFICATION;
    case RecoveryStrategy.RETRY_WITH_EXAMPLE:
      return NextAction.SHOW_FORMAT_EXAMPLE;
    case RecoveryStrategy.SKIP_OPTIONAL_FIELD:
      return NextAction.CONTINUE_WITHOUT_FIELD;
    case RecoveryStrategy.TERMINATE_COLLECTION:
      return NextAction.ROUTE_TO_TERMINATION;
    case RecoveryStrategy.SYSTEM_RECOVERY:
      return NextAction.RETRY_SYSTEM_OPERATION;
    default:
      return NextAction.PROMPT_RETRY;
  }
}

/**
 * Check if error should trigger retry or termination
 * 
 * Requirements: R5.2, R5.4
 */
export function shouldRetry(
  error: ContactError,
  attemptCount: number
): boolean {
  if (!error.retryable || !error.recoverable) {
    return false;
  }

  if (error.maxRetries && attemptCount >= error.maxRetries) {
    return false;
  }

  return true;
}

/**
 * Generate user-friendly error message with recovery guidance
 * 
 * Requirements: R5.3
 */
export function generateErrorMessage(
  error: ContactError,
  recoveryStrategy: RecoveryStrategy
): string {
  let message = error.message;

  if (error.formatExample) {
    message += `. For example: ${error.formatExample}`;
  }

  switch (recoveryStrategy) {
    case RecoveryStrategy.RETRY_WITH_EXAMPLE:
      message += '. Please try again with the correct format.';
      break;
    case RecoveryStrategy.RETRY_WITH_CLARIFICATION:
      message += '. Let me ask for this information again.';
      break;
    case RecoveryStrategy.SKIP_OPTIONAL_FIELD:
      message += '. We can continue without this optional information.';
      break;
    case RecoveryStrategy.SYSTEM_RECOVERY:
      message += '. Please wait a moment while I try again.';
      break;
  }

  return message;
}