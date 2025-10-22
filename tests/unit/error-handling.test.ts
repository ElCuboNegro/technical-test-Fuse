/**
 * Error Handling Unit Tests
 * 
 * Tests for error handling utilities and error code generation used by the contact information node.
 * 
 * Requirements: R5.1, R5.2, R5.3, R5.4
 */

import {
  createContactError,
  handleValidationError,
  isRecoverableError,
  getErrorMessage,
  validatePrerequisites,
  ContactErrorCode,
  ContactError
} from '../../src/utils/error-handling';

describe('Error Handling', () => {
  describe('createContactError', () => {
    it('should create error for invalid state code', () => {
      const error = createContactError('INVALID_STATE_CODE', 'XX is not a valid state code');

      expect(error.code).toBe('INVALID_STATE_CODE');
      expect(error.recoverable).toBe(true);
      expect(error.message).toBe('XX is not a valid state code');
      expect(error.field).toBeUndefined();
    });

    it('should create error for invalid ZIP format', () => {
      const error = createContactError('INVALID_ZIP_FORMAT', 'ZIP code must be 5 digits', 'zipCode');

      expect(error.code).toBe('INVALID_ZIP_FORMAT');
      expect(error.recoverable).toBe(true);
      expect(error.message).toBe('ZIP code must be 5 digits');
      expect(error.field).toBe('zipCode');
      expect(error.formatExample).toBe('12345 or 12345-6789');
    });

    it('should create error for invalid email format', () => {
      const error = createContactError('INVALID_EMAIL_FORMAT', 'Email format is invalid', 'email');

      expect(error.code).toBe('INVALID_EMAIL_FORMAT');
      expect(error.recoverable).toBe(true);
      expect(error.field).toBe('email');
      expect(error.formatExample).toBe('user@example.com');
    });

    it('should create non-recoverable error for identity not verified', () => {
      const error = createContactError('IDENTITY_NOT_VERIFIED', 'Identity must be verified first');

      expect(error.code).toBe('IDENTITY_NOT_VERIFIED');
      expect(error.recoverable).toBe(false);
      expect(error.message).toBe('Identity must be verified first');
    });

    it('should create error for email confirmation failure', () => {
      const error = createContactError('EMAIL_CONFIRMATION_FAILED', 'Email spelling confirmation failed');

      expect(error.code).toBe('EMAIL_CONFIRMATION_FAILED');
      expect(error.recoverable).toBe(true);
      expect(error.message).toBe('Email spelling confirmation failed');
    });
  });

  describe('handleValidationError', () => {
    it('should handle invalid state error with recovery info', () => {
      const result = handleValidationError('state', 'XX');

      expect(result.lastError.code).toBe('INVALID_STATE_CODE');
      expect(result.lastError.recoverable).toBe(true);
      expect(result.needs.contact).toBe(true);
      expect(result.lastError.formatExample).toBe('CA, NY, TX, FL');
    });

    it('should handle invalid ZIP error with recovery info', () => {
      const result = handleValidationError('zipCode', '1234');

      expect(result.lastError.code).toBe('INVALID_ZIP_FORMAT');
      expect(result.lastError.recoverable).toBe(true);
      expect(result.needs.contact).toBe(true);
      expect(result.lastError.formatExample).toBe('12345 or 12345-6789');
    });

    it('should handle invalid email error with recovery info', () => {
      const result = handleValidationError('email', 'invalid-email');

      expect(result.lastError.code).toBe('INVALID_EMAIL_FORMAT');
      expect(result.lastError.recoverable).toBe(true);
      expect(result.needs.contact).toBe(true);
      expect(result.lastError.formatExample).toBe('user@example.com');
    });

    it('should handle missing address components', () => {
      const result = handleValidationError('address', null);

      expect(result.lastError.code).toBe('ADDRESS_INCOMPLETE');
      expect(result.lastError.recoverable).toBe(true);
      expect(result.needs.contact).toBe(true);
    });

    it('should handle unknown field gracefully', () => {
      const result = handleValidationError('unknown' as any, 'value');

      expect(result.lastError.code).toBe('VALIDATION_ERROR');
      expect(result.lastError.recoverable).toBe(true);
      expect(result.needs.contact).toBe(true);
    });
  });

  describe('isRecoverableError', () => {
    it('should identify recoverable errors', () => {
      expect(isRecoverableError('INVALID_STATE_CODE')).toBe(true);
      expect(isRecoverableError('INVALID_ZIP_FORMAT')).toBe(true);
      expect(isRecoverableError('INVALID_EMAIL_FORMAT')).toBe(true);
      expect(isRecoverableError('EMAIL_CONFIRMATION_FAILED')).toBe(true);
      expect(isRecoverableError('ADDRESS_INCOMPLETE')).toBe(true);
    });

    it('should identify non-recoverable errors', () => {
      expect(isRecoverableError('IDENTITY_NOT_VERIFIED')).toBe(false);
      expect(isRecoverableError('SYSTEM_ERROR')).toBe(false);
    });

    it('should default to recoverable for unknown errors', () => {
      expect(isRecoverableError('UNKNOWN_ERROR' as any)).toBe(true);
    });
  });

  describe('getErrorMessage', () => {
    it('should return user-friendly messages for validation errors', () => {
      expect(getErrorMessage('INVALID_STATE_CODE')).toBe('Please provide a valid 2-letter state code.');
      expect(getErrorMessage('INVALID_ZIP_FORMAT')).toBe('Please provide a valid ZIP code.');
      expect(getErrorMessage('INVALID_EMAIL_FORMAT')).toBe('Please provide a valid email address.');
      expect(getErrorMessage('ADDRESS_INCOMPLETE')).toBe('Please provide your complete address.');
    });

    it('should return specific messages for confirmation errors', () => {
      expect(getErrorMessage('EMAIL_CONFIRMATION_FAILED')).toBe('Let me try spelling that email again.');
    });

    it('should return system messages for non-recoverable errors', () => {
      expect(getErrorMessage('IDENTITY_NOT_VERIFIED')).toBe('Identity verification is required to proceed.');
      expect(getErrorMessage('SYSTEM_ERROR')).toBe('A system error occurred. Please try again.');
    });

    it('should return generic message for unknown errors', () => {
      expect(getErrorMessage('UNKNOWN_ERROR' as any)).toBe('An error occurred. Please try again.');
    });
  });

  describe('validatePrerequisites', () => {
    it('should pass when identity is verified', () => {
      const state = {
        identityVerified: true,
        needs: { identity: false, contact: true, financial: false, confirm: false }
      };

      const result = validatePrerequisites(state);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should fail when identity is not verified', () => {
      const state = {
        identityVerified: false,
        needs: { identity: true, contact: false, financial: false, confirm: false }
      };

      const result = validatePrerequisites(state);

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('IDENTITY_NOT_VERIFIED');
      expect(result.error?.recoverable).toBe(false);
    });

    it('should handle missing state gracefully', () => {
      const result = validatePrerequisites(null as any);

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_STATE');
      expect(result.error?.recoverable).toBe(false);
    });

    it('should handle undefined identity verification', () => {
      const state = {
        needs: { identity: true, contact: false, financial: false, confirm: false }
      };

      const result = validatePrerequisites(state as any);

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('IDENTITY_NOT_VERIFIED');
    });
  });

  describe('specific error code generation', () => {
    it('should generate specific error codes for all validation failures', () => {
      const testCases = [
        { field: 'state', value: 'XX', expectedCode: 'INVALID_STATE_CODE' },
        { field: 'zipCode', value: '123', expectedCode: 'INVALID_ZIP_FORMAT' },
        { field: 'email', value: 'invalid', expectedCode: 'INVALID_EMAIL_FORMAT' },
        { field: 'address', value: null, expectedCode: 'ADDRESS_INCOMPLETE' }
      ];

      testCases.forEach(({ field, value, expectedCode }) => {
        const result = handleValidationError(field as any, value);
        expect(result.lastError.code).toBe(expectedCode);
      });
    });

    it('should provide format examples for all validation errors', () => {
      const testCases = [
        { field: 'state', value: 'XX', expectedExample: 'CA, NY, TX, FL' },
        { field: 'zipCode', value: '123', expectedExample: '12345 or 12345-6789' },
        { field: 'email', value: 'invalid', expectedExample: 'user@example.com' }
      ];

      testCases.forEach(({ field, value, expectedExample }) => {
        const result = handleValidationError(field as any, value);
        expect(result.lastError.formatExample).toBe(expectedExample);
      });
    });
  });

  describe('error recovery scenarios', () => {
    it('should handle state validation error with recovery', () => {
      const error = createContactError('INVALID_STATE_CODE', 'Invalid state: XX', 'state');
      
      expect(error.recoverable).toBe(true);
      expect(error.formatExample).toBe('CA, NY, TX, FL');
      expect(getErrorMessage(error.code)).toBe('Please provide a valid 2-letter state code.');
    });

    it('should handle ZIP validation error with recovery', () => {
      const error = createContactError('INVALID_ZIP_FORMAT', 'Invalid ZIP: 123', 'zipCode');
      
      expect(error.recoverable).toBe(true);
      expect(error.formatExample).toBe('12345 or 12345-6789');
      expect(getErrorMessage(error.code)).toBe('Please provide a valid ZIP code.');
    });

    it('should handle email confirmation failure with recovery', () => {
      const error = createContactError('EMAIL_CONFIRMATION_FAILED', 'Email confirmation failed');
      
      expect(error.recoverable).toBe(true);
      expect(getErrorMessage(error.code)).toBe('Let me try spelling that email again.');
    });

    it('should handle prerequisite failures without recovery', () => {
      const error = createContactError('IDENTITY_NOT_VERIFIED', 'Identity not verified');
      
      expect(error.recoverable).toBe(false);
      expect(getErrorMessage(error.code)).toBe('Identity verification is required to proceed.');
    });
  });

  describe('error state management', () => {
    it('should set needs.contact=true for recoverable errors', () => {
      const recoverableErrors = [
        'INVALID_STATE_CODE',
        'INVALID_ZIP_FORMAT', 
        'INVALID_EMAIL_FORMAT',
        'EMAIL_CONFIRMATION_FAILED',
        'ADDRESS_INCOMPLETE'
      ];

      recoverableErrors.forEach(errorCode => {
        const result = handleValidationError('test' as any, 'value');
        expect(result.needs.contact).toBe(true);
      });
    });

    it('should preserve other state properties during error handling', () => {
      const result = handleValidationError('state', 'XX');

      expect(result).toHaveProperty('lastError');
      expect(result).toHaveProperty('needs');
      expect(result.needs).toEqual({
        identity: false,
        contact: true,
        financial: false,
        confirm: false
      });
    });

    it('should create complete error objects with all required fields', () => {
      const error = createContactError('INVALID_ZIP_FORMAT', 'Invalid ZIP', 'zipCode');

      expect(error).toHaveProperty('code');
      expect(error).toHaveProperty('recoverable');
      expect(error).toHaveProperty('message');
      expect(error).toHaveProperty('field');
      expect(error).toHaveProperty('formatExample');

      expect(typeof error.code).toBe('string');
      expect(typeof error.recoverable).toBe('boolean');
      expect(typeof error.message).toBe('string');
      expect(typeof error.field).toBe('string');
      expect(typeof error.formatExample).toBe('string');
    });
  });
});