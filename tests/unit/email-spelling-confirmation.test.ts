/**
 * Email Spelling Confirmation Unit Tests
 * 
 * Tests for email spelling confirmation functionality including letter-by-letter
 * confirmation flow and error handling.
 * 
 * Requirements: R2.3, R2.4, R3.2
 */

import {
  spellEmailForTTS,
  confirmEmailSpelling,
  handleEmailConfirmation,
  formatEmailSpelling
} from '../../src/utils/email-spelling-confirmation';

describe('Email Spelling Confirmation', () => {
  describe('spellEmailForTTS', () => {
    it('should spell email letter-by-letter with proper formatting', () => {
      expect(spellEmailForTTS('user@example.com')).toBe('u-s-e-r at e-x-a-m-p-l-e dot c-o-m');
      expect(spellEmailForTTS('test@domain.org')).toBe('t-e-s-t at d-o-m-a-i-n dot o-r-g');
    });

    it('should handle complex email addresses', () => {
      expect(spellEmailForTTS('mike.smith+dev@gmail.com')).toBe('m-i-k-e dot s-m-i-t-h plus d-e-v at g-m-a-i-l dot c-o-m');
      expect(spellEmailForTTS('firstname.lastname@company.co.uk')).toBe('f-i-r-s-t-n-a-m-e dot l-a-s-t-n-a-m-e at c-o-m-p-a-n-y dot c-o dot u-k');
    });

    it('should handle special characters properly', () => {
      expect(spellEmailForTTS('user+tag@example.com')).toBe('u-s-e-r plus t-a-g at e-x-a-m-p-l-e dot c-o-m');
      expect(spellEmailForTTS('user-name@sub-domain.com')).toBe('u-s-e-r dash n-a-m-e at s-u-b dash d-o-m-a-i-n dot c-o-m');
      expect(spellEmailForTTS('user_name@example.com')).toBe('u-s-e-r underscore n-a-m-e at e-x-a-m-p-l-e dot c-o-m');
    });

    it('should handle numbers in email addresses', () => {
      expect(spellEmailForTTS('user123@example.com')).toBe('u-s-e-r 1-2-3 at e-x-a-m-p-l-e dot c-o-m');
      expect(spellEmailForTTS('test2024@domain.org')).toBe('t-e-s-t 2-0-2-4 at d-o-m-a-i-n dot o-r-g');
    });

    it('should handle edge cases', () => {
      expect(spellEmailForTTS('')).toBe('');
      expect(spellEmailForTTS('a@b.c')).toBe('a at b dot c');
    });

    it('should handle null and undefined', () => {
      expect(spellEmailForTTS(null as any)).toBe('');
      expect(spellEmailForTTS(undefined as any)).toBe('');
    });
  });

  describe('formatEmailSpelling', () => {
    it('should format email with clear pronunciation markers', () => {
      expect(formatEmailSpelling('user@example.com')).toContain('u-s-e-r  at  e-x-a-m-p-l-e  dot  c-o-m');
    });

    it('should add pauses for TTS clarity', () => {
      const result = formatEmailSpelling('test@domain.org');
      expect(result).toContain('  at  '); // Double spaces for pauses
      expect(result).toContain('  dot  '); // Double spaces for pauses
    });

    it('should handle complex emails with proper spacing', () => {
      const result = formatEmailSpelling('mike.smith+dev@gmail.com');
      expect(result).toContain('m-i-k-e  dot  s-m-i-t-h  plus  d-e-v  at  g-m-a-i-l  dot  c-o-m');
    });
  });

  describe('confirmEmailSpelling', () => {
    it('should return confirmation result for valid email', async () => {
      const mockConfirmationCallback = jest.fn().mockResolvedValue(true);
      
      const result = await confirmEmailSpelling('user@example.com', mockConfirmationCallback);
      
      expect(result.confirmed).toBe(true);
      expect(result.spelledEmail).toBe('u-s-e-r at e-x-a-m-p-l-e dot c-o-m');
      expect(mockConfirmationCallback).toHaveBeenCalledWith(
        expect.stringContaining('u-s-e-r  at  e-x-a-m-p-l-e  dot  c-o-m')
      );
    });

    it('should handle confirmation rejection', async () => {
      const mockConfirmationCallback = jest.fn().mockResolvedValue(false);
      
      const result = await confirmEmailSpelling('user@example.com', mockConfirmationCallback);
      
      expect(result.confirmed).toBe(false);
      expect(result.spelledEmail).toBe('u-s-e-r at e-x-a-m-p-l-e dot c-o-m');
      expect(result.needsCorrection).toBe(true);
    });

    it('should handle complex email confirmation', async () => {
      const mockConfirmationCallback = jest.fn().mockResolvedValue(true);
      
      const result = await confirmEmailSpelling('mike.smith+dev@gmail.com', mockConfirmationCallback);
      
      expect(result.confirmed).toBe(true);
      expect(result.spelledEmail).toBe('m-i-k-e dot s-m-i-t-h plus d-e-v at g-m-a-i-l dot c-o-m');
      expect(mockConfirmationCallback).toHaveBeenCalledWith(
        expect.stringContaining('m-i-k-e  dot  s-m-i-t-h  plus  d-e-v  at  g-m-a-i-l  dot  c-o-m')
      );
    });

    it('should handle callback errors gracefully', async () => {
      const mockConfirmationCallback = jest.fn().mockRejectedValue(new Error('Callback failed'));
      
      const result = await confirmEmailSpelling('user@example.com', mockConfirmationCallback);
      
      expect(result.confirmed).toBe(false);
      expect(result.error).toBe('Callback failed');
    });
  });

  describe('handleEmailConfirmation', () => {
    it('should return success state when first confirmation succeeds', async () => {
      const mockState = {
        collected: { contact: {} },
        needs: { contact: true },
        lastError: null
      };

      const mockConfirmationCallback = jest.fn().mockResolvedValue(true);
      
      const result = await handleEmailConfirmation(
        'user@example.com',
        mockState,
        mockConfirmationCallback
      );
      
      expect(result.collected.contact.email).toBe('user@example.com');
      expect(result.needs.contact).toBe(false);
      expect(result.lastError).toBe(null);
    });

    it('should return error state when first confirmation fails', async () => {
      const mockState = {
        collected: { contact: {} },
        needs: { contact: true },
        lastError: null,
        contactProgress: { emailConfirmationAttempts: 0 }
      };

      const mockConfirmationCallback = jest.fn().mockResolvedValue(false);
      
      const result = await handleEmailConfirmation(
        'user@example.com',
        mockState,
        mockConfirmationCallback
      );
      
      expect(result.lastError?.code).toBe('EMAIL_CONFIRMATION_FAILED');
      expect(result.needs.contact).toBe(true);
      expect(result.contactProgress.emailConfirmationAttempts).toBe(1);
    });

    it('should return success when second confirmation succeeds', async () => {
      const mockState = {
        collected: { contact: {} },
        needs: { contact: true },
        lastError: { code: 'EMAIL_CONFIRMATION_FAILED' },
        contactProgress: { emailConfirmationAttempts: 1 }
      };

      const mockConfirmationCallback = jest.fn().mockResolvedValue(true);
      
      const result = await handleEmailConfirmation(
        'corrected@example.com',
        mockState,
        mockConfirmationCallback
      );
      
      expect(result.collected.contact.email).toBe('corrected@example.com');
      expect(result.needs.contact).toBe(false);
      expect(result.lastError).toBe(null);
      expect(result.contactProgress.emailConfirmationAttempts).toBe(2);
    });

    it('should handle email correction after failed confirmation', async () => {
      const mockState = {
        collected: { contact: {} },
        needs: { contact: true },
        lastError: { code: 'EMAIL_CONFIRMATION_FAILED' },
        contactProgress: { emailConfirmationAttempts: 1 }
      };

      const mockConfirmationCallback = jest.fn().mockResolvedValue(false);
      
      const result = await handleEmailConfirmation(
        'user@example.com',
        mockState,
        mockConfirmationCallback
      );
      
      expect(result.lastError?.code).toBe('EMAIL_CONFIRMATION_FAILED');
      expect(result.needs.contact).toBe(true);
      expect(result.contactProgress.emailConfirmationAttempts).toBe(2);
      expect(result.contactProgress.needsEmailCorrection).toBe(true);
    });

    it('should normalize email before storing', async () => {
      const mockState = {
        collected: { contact: {} },
        needs: { contact: true },
        lastError: null
      };

      const mockConfirmationCallback = jest.fn().mockResolvedValue(true);
      
      const result = await handleEmailConfirmation(
        '  USER@EXAMPLE.COM  ',
        mockState,
        mockConfirmationCallback
      );
      
      expect(result.collected.contact.email).toBe('user@example.com');
    });
  });

  describe('letter-by-letter spelling flow', () => {
    it('should provide complete spelling confirmation workflow', async () => {
      const email = 'mike.smith+dev@gmail.com';
      const mockConfirmationCallback = jest.fn().mockResolvedValue(true);
      
      // Step 1: Spell the email
      const spelledEmail = spellEmailForTTS(email);
      expect(spelledEmail).toBe('m-i-k-e dot s-m-i-t-h plus d-e-v at g-m-a-i-l dot c-o-m');
      
      // Step 2: Format for TTS
      const formattedSpelling = formatEmailSpelling(email);
      expect(formattedSpelling).toContain('m-i-k-e  dot  s-m-i-t-h  plus  d-e-v  at  g-m-a-i-l  dot  c-o-m');
      
      // Step 3: Confirm spelling
      const confirmation = await confirmEmailSpelling(email, mockConfirmationCallback);
      expect(confirmation.confirmed).toBe(true);
      expect(confirmation.spelledEmail).toBe(spelledEmail);
    });

    it('should handle correction flow when spelling is rejected', async () => {
      const email = 'user@example.com';
      let confirmationAttempt = 0;
      
      const mockConfirmationCallback = jest.fn().mockImplementation(() => {
        confirmationAttempt++;
        return Promise.resolve(confirmationAttempt > 1); // Fail first, succeed second
      });
      
      // First attempt - should fail
      const firstResult = await confirmEmailSpelling(email, mockConfirmationCallback);
      expect(firstResult.confirmed).toBe(false);
      expect(firstResult.needsCorrection).toBe(true);
      
      // Second attempt with corrected email - should succeed
      const correctedEmail = 'corrected@example.com';
      const secondResult = await confirmEmailSpelling(correctedEmail, mockConfirmationCallback);
      expect(secondResult.confirmed).toBe(true);
    });
  });
});