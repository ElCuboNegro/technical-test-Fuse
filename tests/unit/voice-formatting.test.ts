/**
 * Voice Formatting Utilities Unit Tests
 * 
 * Tests for TTS-optimized formatting utilities used by the contact information node.
 * 
 * Requirements: R3.1, R3.2, R3.3
 */

import {
  formatZipForTTS,
  spellEmailForTTS,
  formatAddressForTTS,
  formatStateForTTS,
  formatUnitNumberForTTS
} from '../../src/utils/voice-formatting';

describe('Voice Formatting Utilities', () => {
  describe('formatZipForTTS', () => {
    it('should format 5-digit ZIP codes with dashes', () => {
      expect(formatZipForTTS('12345')).toBe('1-2-3-4-5');
      expect(formatZipForTTS('90210')).toBe('9-0-2-1-0');
      expect(formatZipForTTS('00501')).toBe('0-0-5-0-1');
    });

    it('should format ZIP+4 codes with dash separator', () => {
      expect(formatZipForTTS('12345-6789')).toBe('1-2-3-4-5, dash, 6-7-8-9');
      expect(formatZipForTTS('90210-1234')).toBe('9-0-2-1-0, dash, 1-2-3-4');
      expect(formatZipForTTS('00501-0001')).toBe('0-0-5-0-1, dash, 0-0-0-1');
    });

    it('should handle edge cases', () => {
      expect(formatZipForTTS('')).toBe('');
      expect(formatZipForTTS(null as any)).toBe('');
      expect(formatZipForTTS(undefined as any)).toBe('');
    });

    it('should handle invalid ZIP formats gracefully', () => {
      expect(formatZipForTTS('1234')).toBe('1-2-3-4'); // Still format what's given
      expect(formatZipForTTS('123456')).toBe('1-2-3-4-5-6'); // Still format what's given
    });
  });

  describe('spellEmailForTTS', () => {
    it('should spell simple emails with proper formatting', () => {
      expect(spellEmailForTTS('user@example.com')).toContain('u-s-e-r  at  e-x-a-m-p-l-e  dot  c-o-m');
    });

    it('should handle complex email addresses', () => {
      const result = spellEmailForTTS('mike.smith+dev@gmail.com');
      expect(result).toContain('m-i-k-e');
      expect(result).toContain('dot');
      expect(result).toContain('s-m-i-t-h');
      expect(result).toContain('plus');
      expect(result).toContain('d-e-v');
      expect(result).toContain('at');
      expect(result).toContain('g-m-a-i-l');
      expect(result).toContain('dot');
      expect(result).toContain('c-o-m');
    });

    it('should handle special characters with proper pronunciation', () => {
      expect(spellEmailForTTS('user+tag@example.com')).toContain('plus');
      expect(spellEmailForTTS('user-name@example.com')).toContain('dash');
      expect(spellEmailForTTS('user_name@example.com')).toContain('underscore');
    });

    it('should handle numbers in email addresses', () => {
      const result = spellEmailForTTS('user123@example.com');
      expect(result).toContain('u-s-e-r 1-2-3');
      expect(result).toContain('at');
      expect(result).toContain('e-x-a-m-p-l-e');
    });

    it('should handle edge cases', () => {
      expect(spellEmailForTTS('')).toBe('');
      expect(spellEmailForTTS(null as any)).toBe('');
      expect(spellEmailForTTS(undefined as any)).toBe('');
    });
  });

  describe('formatAddressForTTS', () => {
    it('should format complete address with natural pauses', () => {
      const address = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345'
      };

      const result = formatAddressForTTS(address);
      expect(result).toBe('123 Main St, Anytown, CA, 1-2-3-4-5');
    });

    it('should include unit number when present', () => {
      const address = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345',
        unitNumber: 'Apt 4B'
      };

      const result = formatAddressForTTS(address);
      expect(result).toBe('123 Main St, Apt 4B, Anytown, CA, 1-2-3-4-5');
    });

    it('should handle ZIP+4 format', () => {
      const address = {
        street: '456 Oak Ave',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701-1234'
      };

      const result = formatAddressForTTS(address);
      expect(result).toBe('456 Oak Ave, Springfield, IL, 6-2-7-0-1, dash, 1-2-3-4');
    });

    it('should handle missing unit number gracefully', () => {
      const address = {
        street: '789 Pine Rd',
        city: 'Hometown',
        state: 'TX',
        zipCode: '75001'
      };

      const result = formatAddressForTTS(address);
      expect(result).toBe('789 Pine Rd, Hometown, TX, 7-5-0-0-1');
    });

    it('should handle edge cases', () => {
      expect(formatAddressForTTS(null as any)).toBe('');
      expect(formatAddressForTTS(undefined as any)).toBe('');
      expect(formatAddressForTTS({} as any)).toBe('');
    });

    it('should handle partial address data', () => {
      const partialAddress = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: ''
      };

      const result = formatAddressForTTS(partialAddress);
      expect(result).toContain('123 Main St');
      expect(result).toContain('Anytown');
      expect(result).toContain('CA');
    });
  });

  describe('formatStateForTTS', () => {
    it('should format state codes clearly', () => {
      expect(formatStateForTTS('CA')).toBe('California');
      expect(formatStateForTTS('NY')).toBe('New York');
      expect(formatStateForTTS('TX')).toBe('Texas');
      expect(formatStateForTTS('FL')).toBe('Florida');
    });

    it('should handle lowercase state codes', () => {
      expect(formatStateForTTS('ca')).toBe('California');
      expect(formatStateForTTS('ny')).toBe('New York');
      expect(formatStateForTTS('tx')).toBe('Texas');
    });

    it('should handle DC specially', () => {
      expect(formatStateForTTS('DC')).toBe('District of Columbia');
      expect(formatStateForTTS('dc')).toBe('District of Columbia');
    });

    it('should fallback to code for unknown states', () => {
      expect(formatStateForTTS('XX')).toBe('XX');
      expect(formatStateForTTS('ZZ')).toBe('ZZ');
    });

    it('should handle edge cases', () => {
      expect(formatStateForTTS('')).toBe('');
      expect(formatStateForTTS(null as any)).toBe('');
      expect(formatStateForTTS(undefined as any)).toBe('');
    });
  });

  describe('formatUnitNumberForTTS', () => {
    it('should format apartment numbers clearly', () => {
      expect(formatUnitNumberForTTS('Apt 4B')).toBe('Apartment 4B');
      expect(formatUnitNumberForTTS('APT 15')).toBe('Apartment 15');
      expect(formatUnitNumberForTTS('apt 2A')).toBe('Apartment 2A');
    });

    it('should format suite numbers clearly', () => {
      expect(formatUnitNumberForTTS('Suite 200')).toBe('Suite 200');
      expect(formatUnitNumberForTTS('Ste 15')).toBe('Suite 15');
      expect(formatUnitNumberForTTS('STE 100')).toBe('Suite 100');
    });

    it('should format unit numbers clearly', () => {
      expect(formatUnitNumberForTTS('Unit 5')).toBe('Unit 5');
      expect(formatUnitNumberForTTS('UNIT 12')).toBe('Unit 12');
    });

    it('should format building designations clearly', () => {
      expect(formatUnitNumberForTTS('Bldg A')).toBe('Building A');
      expect(formatUnitNumberForTTS('Building 2')).toBe('Building 2');
    });

    it('should format floor designations clearly', () => {
      expect(formatUnitNumberForTTS('Fl 3')).toBe('Floor 3');
      expect(formatUnitNumberForTTS('Floor 15')).toBe('Floor 15');
    });

    it('should handle number signs', () => {
      expect(formatUnitNumberForTTS('#5')).toBe('Number 5');
      expect(formatUnitNumberForTTS('# 12')).toBe('Number 12');
    });

    it('should handle simple numbers', () => {
      expect(formatUnitNumberForTTS('4B')).toBe('4B');
      expect(formatUnitNumberForTTS('15')).toBe('15');
      expect(formatUnitNumberForTTS('A')).toBe('A');
    });

    it('should handle edge cases', () => {
      expect(formatUnitNumberForTTS('')).toBe('');
      expect(formatUnitNumberForTTS(null as any)).toBe('');
      expect(formatUnitNumberForTTS(undefined as any)).toBe('');
    });
  });

  describe('integration scenarios', () => {
    it('should format complete address with all components for TTS', () => {
      const address = {
        street: '2580 Broadway St',
        city: 'New York',
        state: 'NY',
        zipCode: '10025-1234',
        unitNumber: 'Apt 15F'
      };

      const result = formatAddressForTTS(address);
      
      // Should include street with unit
      expect(result).toContain('2580 Broadway St');
      expect(result).toContain('Apt 15F');
      
      // Should include city and state
      expect(result).toContain('New York');
      expect(result).toContain('NY');
      
      // Should format ZIP+4 properly
      expect(result).toContain('1-0-0-2-5, dash, 1-2-3-4');
    });

    it('should handle email and address formatting together', () => {
      const email = 'user@example.com';
      const address = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345'
      };

      const emailFormatted = spellEmailForTTS(email);
      const addressFormatted = formatAddressForTTS(address);

      expect(emailFormatted).toContain('u-s-e-r  at  e-x-a-m-p-l-e  dot  c-o-m');
      expect(addressFormatted).toBe('123 Main St, Anytown, CA, 1-2-3-4-5');
    });

    it('should maintain consistency across all formatting functions', () => {
      // All functions should handle null/undefined consistently
      expect(formatZipForTTS(null as any)).toBe('');
      expect(spellEmailForTTS(null as any)).toBe('');
      expect(formatAddressForTTS(null as any)).toBe('');
      expect(formatStateForTTS(null as any)).toBe('');
      expect(formatUnitNumberForTTS(null as any)).toBe('');

      // All functions should handle empty strings consistently
      expect(formatZipForTTS('')).toBe('');
      expect(spellEmailForTTS('')).toBe('');
      expect(formatStateForTTS('')).toBe('');
      expect(formatUnitNumberForTTS('')).toBe('');
    });
  });
});