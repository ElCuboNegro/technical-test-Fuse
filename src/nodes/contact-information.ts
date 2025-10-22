/**
 * Contact Information Node Implementation
 * 
 * LangGraph node that serves as a contact collection gate after successful
 * identity verification. Collects complete mailing address and optional email
 * with voice-optimized prompts and confirmation loops.
 * 
 * Requirements: R1.1, R1.2, R1.3, R1.4, R2.1, R2.2, R2.3, R2.4, R4.1, R4.2, R4.3, R4.4
 */

import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';

// Schema imports
import { AddressExtract, EmailExtract, validateAddressData, validateEmailData } from '../utils/contact-schemas';

// Utility imports
import { extractWithSchema } from '../utils/llm-extraction';
import { handleUnitNumber } from '../utils/unit-number-detection';
import { confirmEmailSpelling } from '../utils/email-spelling-confirmation';
import { redactContactPII } from '../utils/contact-pii-redaction';
import { normalizeAddress, validateAddress } from '../utils/address-validation';
import { normalizeEmail, validateEmail } from '../utils/email-validation';

// State management imports
import { 
  updateContactState, 
  updateStateForRetry, 
  updateContactProgress,
  createContactTelemetryEvent,
  ContactState,
  ContactData,
  AddressData
} from '../utils/contact-state-management';

// Error handling imports
import { 
  classifyContactError,
  ContactErrorCode,
  shouldRetry,
  generateErrorMessage
} from '../utils/contact-error-classification';

// Prompt imports
import { CONTACT_PROMPTS, ContactPromptGenerator } from '../prompts/contact-prompts';

export interface ContactNodeConfig {
  inputText?: string;
  callbacks?: {
    onEvent?: (event: any) => void;
    onPrompt?: (key: string) => Promise<boolean>;
  };
  metadata?: {
    sessionId?: string;
    userId?: string;
  };
  llm?: any;
}

export interface ContactNodeInput {
  state: ContactState;
  config?: ContactNodeConfig;
}

export interface ContactNodeOutput {
  collected?: {
    contact?: ContactData;
  };
  needs?: {
    identity: boolean;
    contact: boolean;
    financial: boolean;
    confirm: boolean;
  };
  contactProgress?: {
    addressComplete: boolean;
    emailComplete: boolean;
    unitNumberAsked: boolean;
    emailConfirmationAttempts?: number;
    needsEmailCorrection?: boolean;
  };
  lastError?: {
    code: string;
    recoverable: boolean;
    message?: string;
    field?: string;
  } | null;
}

/**
 * Contact Information Node - Main Implementation
 * 
 * Requirements: R1.1, R1.2, R1.3, R1.4, R2.1, R2.2, R2.3, R2.4, R4.1, R4.2, R4.3, R4.4
 */
export const contactNode = RunnableLambda.from(async ({ state, config }: ContactNodeInput): Promise<ContactNodeOutput> => {
  try {
    // 1) Verify prerequisites (identity must be verified) - per requirements R4.1
    if (!state.identityVerified) {
      const errorResult = classifyContactError(ContactErrorCode.IDENTITY_NOT_VERIFIED);
      
      // Emit telemetry event
      if (config?.callbacks?.onEvent) {
        const telemetryEvent = createContactTelemetryEvent(
          'contact_collection_failed',
          false,
          undefined,
          errorResult.error,
          config.metadata?.sessionId,
          config.metadata?.userId
        );
        config.callbacks.onEvent(telemetryEvent);
      }

      return {
        lastError: {
          code: errorResult.error.code,
          recoverable: errorResult.error.recoverable,
          message: errorResult.error.message
        }
      };
    }

    // 2) Extract address via structured extraction - per requirements R1.1, R1.2
    const addressExtractionResult = await extractWithSchema(
      config?.inputText || '',
      AddressExtract,
      {
        systemHint: 'Extract address components (street, city, state, zipCode, unitNumber) from the conversation text. Return as JSON.',
        maxRetries: 2
      }
    );

    if (!addressExtractionResult.success || !addressExtractionResult.data) {
      const errorResult = classifyContactError(ContactErrorCode.EXTRACTION_FAILED, 'address');
      
      return updateStateForRetry(state, errorResult.error, 'address').newState;
    }

    // 3) Validate and normalize address - per requirements R1.2, R1.3
    const addressValidation = validateAddressData(addressExtractionResult.data);
    if (!addressValidation.success) {
      const errorResult = classifyContactError(ContactErrorCode.ADDRESS_INCOMPLETE, 'address');
      
      return updateStateForRetry(state, errorResult.error, 'address').newState;
    }

    const normalizedAddress = normalizeAddress(addressValidation.data!);

    // 4) Handle unit number if needed and not already asked - per requirements R1.3, R1.4
    const unitNumberResult = await handleUnitNumber(
      normalizedAddress,
      state.contactProgress?.unitNumberAsked || false
    );

    // If unit number prompt is needed, update progress and return
    if (unitNumberResult.needsUnitPrompt) {
      const progressUpdate = updateContactProgress(state, {
        unitNumberAsked: true
      });

      // Emit telemetry for unit number request
      if (config?.callbacks?.onEvent) {
        const telemetryEvent = createContactTelemetryEvent(
          'unit_number_requested',
          true,
          undefined,
          undefined,
          config.metadata?.sessionId,
          config.metadata?.userId
        );
        config.callbacks.onEvent(telemetryEvent);
      }

      return {
        ...progressUpdate,
        needs: {
          ...state.needs,
          contact: true
        }
      };
    }

    const finalAddress = unitNumberResult.address;

    // 5) Extract and validate email (optional) - per requirements R2.1, R2.2
    let emailData: string | undefined;
    const emailExtractionResult = await extractWithSchema(
      config?.inputText || '',
      EmailExtract,
      {
        systemHint: 'Extract email address from the conversation text if provided. Return as JSON with email field.',
        maxRetries: 1
      }
    );

    if (emailExtractionResult.success && emailExtractionResult.data?.email) {
      const email = normalizeEmail(emailExtractionResult.data.email);
      
      if (validateEmail(email)) {
        // 6) Email spelling confirmation - per requirements R2.3, R2.4
        if (config?.callbacks?.onPrompt) {
          const confirmationResult = await confirmEmailSpelling(
            email,
            async (prompt: string) => {
              // Use the prompt callback to get user confirmation
              return await config.callbacks!.onPrompt!(prompt);
            }
          );

          if (!confirmationResult.confirmed) {
            const errorResult = classifyContactError(
              ContactErrorCode.EMAIL_CONFIRMATION_FAILED, 
              'email',
              (state.contactProgress?.emailConfirmationAttempts || 0) + 1
            );

            return updateStateForRetry(state, errorResult.error, 'email').newState;
          }
        }

        emailData = email;
      } else {
        const errorResult = classifyContactError(ContactErrorCode.INVALID_EMAIL_FORMAT, 'email');
        return updateStateForRetry(state, errorResult.error, 'email').newState;
      }
    }

    // 7) Create complete contact data
    const contactData: ContactData = {
      address: finalAddress,
      email: emailData
    };

    // 8) Update state with collected data - per requirements R4.2, R4.3
    const stateUpdateResult = updateContactState(state, contactData);

    if (!stateUpdateResult.success) {
      return {
        lastError: {
          code: stateUpdateResult.error!.code,
          recoverable: stateUpdateResult.error!.recoverable,
          message: stateUpdateResult.error!.message
        }
      };
    }

    // 9) Emit telemetry (redacted for security) - per requirements R6.1, R6.2, R6.3, R6.4
    if (config?.callbacks?.onEvent) {
      const telemetryEvent = createContactTelemetryEvent(
        'contact_collected',
        true,
        contactData,
        undefined,
        config.metadata?.sessionId,
        config.metadata?.userId
      );
      config.callbacks.onEvent(telemetryEvent);
    }

    // 10) Return successful state update
    return stateUpdateResult.newState;

  } catch (error) {
    // Handle unexpected errors
    const contactError = classifyContactError(ContactErrorCode.SYSTEM_ERROR);
    
    // Emit error telemetry
    if (config?.callbacks?.onEvent) {
      const telemetryEvent = createContactTelemetryEvent(
        'contact_collection_error',
        false,
        undefined,
        contactError.error,
        config?.metadata?.sessionId,
        config?.metadata?.userId
      );
      config.callbacks.onEvent(telemetryEvent);
    }

    return {
      lastError: {
        code: contactError.error.code,
        recoverable: contactError.error.recoverable,
        message: error instanceof Error ? error.message : 'Unknown system error'
      },
      needs: {
        ...state.needs,
        contact: true
      }
    };
  }
});

/**
 * Helper function to extract address with schema validation
 * 
 * Requirements: R1.1, R1.2, R1.3
 */
export async function extractAddressWithSchema(
  text: string,
  options: { maxRetries?: number } = {}
): Promise<{ success: boolean; data?: AddressData; errors?: string[] }> {
  const result = await extractWithSchema(text, AddressExtract, {
    systemHint: 'Extract complete address components from the conversation text.',
    maxRetries: options.maxRetries || 2
  });

  if (result.success && result.data) {
    const normalizedAddress = normalizeAddress(result.data);
    
    if (validateAddress(normalizedAddress)) {
      return {
        success: true,
        data: normalizedAddress
      };
    } else {
      return {
        success: false,
        errors: ['Address validation failed']
      };
    }
  }

  return {
    success: false,
    errors: result.errors || ['Address extraction failed']
  };
}

/**
 * Helper function to extract email with validation
 * 
 * Requirements: R2.1, R2.2
 */
export async function extractEmailWithSchema(
  text: string,
  options: { maxRetries?: number } = {}
): Promise<{ success: boolean; data?: string; errors?: string[] }> {
  const result = await extractWithSchema(text, EmailExtract, {
    systemHint: 'Extract email address from the conversation text if provided.',
    maxRetries: options.maxRetries || 1
  });

  if (result.success && result.data?.email) {
    const normalizedEmail = normalizeEmail(result.data.email);
    
    if (validateEmail(normalizedEmail)) {
      return {
        success: true,
        data: normalizedEmail
      };
    } else {
      return {
        success: false,
        errors: ['Email validation failed']
      };
    }
  }

  return {
    success: false,
    errors: result.errors || ['Email extraction failed']
  };
}

/**
 * Helper function to handle email confirmation workflow
 * 
 * Requirements: R2.3, R2.4
 */
export async function handleEmailConfirmationWorkflow(
  email: string,
  confirmationCallback: (prompt: string) => Promise<boolean>,
  maxAttempts: number = 2
): Promise<{ success: boolean; confirmedEmail?: string; error?: string }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const confirmationResult = await confirmEmailSpelling(email, confirmationCallback);
      
      if (confirmationResult.confirmed) {
        return {
          success: true,
          confirmedEmail: email
        };
      }
      
      if (attempt === maxAttempts) {
        return {
          success: false,
          error: 'Email confirmation failed after maximum attempts'
        };
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Email confirmation error'
        };
      }
    }
  }

  return {
    success: false,
    error: 'Email confirmation failed'
  };
}