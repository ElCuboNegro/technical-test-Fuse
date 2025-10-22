/**
 * Unit Number Detection Unit Tests
 * 
 * Tests for unit number detection and handling logic used by the contact information node.
 * 
 * Requirements: R1.3, R1.4
 */

import {
  detectMultiUnitAddress,
  handleUnitNumber,
  validateUnitNumber,
  normalizeUnitNumber
} from '../../src/utils/unit-number-detection';

describe('Unit Number Detection', () => {
  describe('detectMultiUnitAddress', () => {
    it('should detect apartment indicators in various formats', () => {
      expect(detectMultiUnitAddress('2580 Broadway St Apt 15F')).toBe(true);
      expect(detectMultiUnitAddress('123 Main St Apartment 4B')).toBe(true);
      expect(detectMultiUnitAddress('456 Oak Ave APT 2')).toBe(true);
      expect(detectMultiUnitAddress('789 Pine St apartment 3A')).toBe(true);
    });

    it('should detect suite indicators', () => {
      expect(detectMultiUnitAddress('100 Business Blvd Suite 200')).toBe(true);
      expect(detectMultiUnitAddress('200 Office St Ste 5')).toBe(true);
      expect(detectMultiUnitAddress('300 Corporate Dr STE 100')).toBe(true);
      expect(detectMultiUnitAddress('400 Commerce Way suite 15')).toBe(true);
    });

    it('should detect unit indicators', () => {
      expect(detectMultiUnitAddress('500 Residential Way Unit 3')).toBe(true);
      expect(detectMultiUnitAddress('600 Complex Rd UNIT 12')).toBe(true);
      expect(detectMultiUnitAddress('700 Housing St unit 7')).toBe(true);
    });

    it('should detect building indicators', () => {
      expect(detectMultiUnitAddress('800 Campus Dr Building A')).toBe(true);
      expect(detectMultiUnitAddress('900 Industrial Pkwy Bldg 5')).toBe(true);
      expect(detectMultiUnitAddress('1000 Tech Center building 2')).toBe(true);
    });

    it('should detect floor indicators', () => {
      expect(detectMultiUnitAddress('1100 Tower St Floor 15')).toBe(true);
      expect(detectMultiUnitAddress('1200 High Rise Fl 8')).toBe(true);
      expect(detectMultiUnitAddress('1300 Skyscraper Ave floor 22')).toBe(true);
    });

    it('should detect number sign indicators', () => {
      expect(detectMultiUnitAddress('1400 Street Name #15')).toBe(true);
      expect(detectMultiUnitAddress('1500 Avenue Name # 8')).toBe(true);
      expect(detectMultiUnitAddress('1600 Road Name #A')).toBe(true);
    });

    it('should not detect single-unit addresses', () => {
      expect(detectMultiUnitAddress('123 Main St')).toBe(false);
      expect(detectMultiUnitAddress('456 Oak Avenue')).toBe(false);
      expect(detectMultiUnitAddress('789 Simple Road')).toBe(false);
      expect(detectMultiUnitAddress('1000 Residential Drive')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(detectMultiUnitAddress('123 main st apt 4')).toBe(true);
      expect(detectMultiUnitAddress('456 OAK AVE SUITE 2')).toBe(true);
      expect(detectMultiUnitAddress('789 Mixed Case Unit 3')).toBe(true);
      expect(detectMultiUnitAddress('1000 UPPER CASE BUILDING A')).toBe(true);
    });

    it('should handle edge cases', () => {
      expect(detectMultiUnitAddress('')).toBe(false);
      expect(detectMultiUnitAddress(null as any)).toBe(false);
      expect(detectMultiUnitAddress(undefined as any)).toBe(false);
      expect(detectMultiUnitAddress('   ')).toBe(false);
    });
  });

  describe('handleUnitNumber', () => {
    it('should prompt once when multi-unit detected and not already asked', async () => {
      const address = {
        street: '2580 Broadway St Apt 15F',
        city: 'New York',
        state: 'NY',
        zipCode: '10025'
      };

      const result = await handleUnitNumber(address, false);

      expect(result.unitNumberAsked).toBe(true);
      expect(result.needsUnitPrompt).toBe(true);
      expect(result.address).toEqual(address);
    });

    it('should not prompt again when already asked', async () => {
      const address = {
        street: '2580 Broadway St Apt 15F',
        city: 'New York',
        state: 'NY',
        zipCode: '10025'
      };

      const result = await handleUnitNumber(address, true);

      expect(result.unitNumberAsked).toBe(true);
      expect(result.needsUnitPrompt).toBe(false);
      expect(result.address).toEqual(address);
    });

    it('should not prompt for single-unit addresses', async () => {
      const address = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345'
      };

      const result = await handleUnitNumber(address, false);

      expect(result.unitNumberAsked).toBe(true);
      expect(result.needsUnitPrompt).toBe(false);
      expect(result.address).toEqual(address);
    });

    it('should preserve existing unit number and not prompt', async () => {
      const address = {
        street: '2580 Broadway St',
        city: 'New York',
        state: 'NY',
        zipCode: '10025',
        unitNumber: '15F'
      };

      const result = await handleUnitNumber(address, false);

      expect(result.address.unitNumber).toBe('15F');
      expect(result.unitNumberAsked).toBe(true);
      expect(result.needsUnitPrompt).toBe(false);
    });

    it('should handle various multi-unit indicators', async () => {
      const testCases = [
        '100 Main St Suite 200',
        '200 Oak Ave Unit 5',
        '300 Pine St Building A',
        '400 Elm St Floor 3',
        '500 Maple Ave #12'
      ];

      for (const street of testCases) {
        const address = {
          street,
          city: 'Test City',
          state: 'CA',
          zipCode: '12345'
        };

        const result = await handleUnitNumber(address, false);
        expect(result.needsUnitPrompt).toBe(true);
        expect(result.unitNumberAsked).toBe(true);
      }
    });

    it('should set unitNumberAsked=true even for single-unit addresses', async () => {
      const singleUnitAddresses = [
        '123 Main St',
        '456 Oak Avenue',
        '789 Pine Road',
        '1000 Elm Street'
      ];

      for (const street of singleUnitAddresses) {
        const address = {
          street,
          city: 'Test City',
          state: 'CA',
          zipCode: '12345'
        };

        const result = await handleUnitNumber(address, false);
        expect(result.unitNumberAsked).toBe(true);
        expect(result.needsUnitPrompt).toBe(false);
      }
    });
  });

  describe('validateUnitNumber', () => {
    it('should validate common unit number formats', () => {
      expect(validateUnitNumber('Apt 4B')).toBe(true);
      expect(validateUnitNumber('Suite 200')).toBe(true);
      expect(validateUnitNumber('Unit 15')).toBe(true);
      expect(validateUnitNumber('15F')).toBe(true);
      expect(validateUnitNumber('A')).toBe(true);
      expect(validateUnitNumber('12')).toBe(true);
      expect(validateUnitNumber('#5')).toBe(true);
    });

    it('should handle various formats', () => {
      expect(validateUnitNumber('Apartment 4B')).toBe(true);
      expect(validateUnitNumber('Ste 100')).toBe(true);
      expect(validateUnitNumber('Bldg A')).toBe(true);
      expect(validateUnitNumber('Floor 3')).toBe(true);
      expect(validateUnitNumber('Fl 15')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(validateUnitNumber('')).toBe(false);
      expect(validateUnitNumber('   ')).toBe(false);
      expect(validateUnitNumber(null as any)).toBe(false);
      expect(validateUnitNumber(undefined as any)).toBe(false);
    });

    it('should handle reasonable length limits', () => {
      expect(validateUnitNumber('A'.repeat(50))).toBe(true);
      expect(validateUnitNumber('A'.repeat(101))).toBe(false); // Too long
    });
  });

  describe('normalizeUnitNumber', () => {
    it('should trim whitespace', () => {
      expect(normalizeUnitNumber('  Apt 4B  ')).toBe('Apt 4B');
      expect(normalizeUnitNumber('   Suite 200   ')).toBe('Suite 200');
    });

    it('should preserve original formatting', () => {
      expect(normalizeUnitNumber('Apt 4B')).toBe('Apt 4B');
      expect(normalizeUnitNumber('Suite 200')).toBe('Suite 200');
      expect(normalizeUnitNumber('Unit 15F')).toBe('Unit 15F');
      expect(normalizeUnitNumber('#12')).toBe('#12');
    });

    it('should handle empty or null values', () => {
      expect(normalizeUnitNumber('')).toBe('');
      expect(normalizeUnitNumber('   ')).toBe('');
      expect(normalizeUnitNumber(null as any)).toBe('');
      expect(normalizeUnitNumber(undefined as any)).toBe('');
    });

    it('should standardize common abbreviations', () => {
      expect(normalizeUnitNumber('apartment 4B')).toBe('Apt 4B');
      expect(normalizeUnitNumber('APARTMENT 4B')).toBe('Apt 4B');
      expect(normalizeUnitNumber('suite 200')).toBe('Suite 200');
      expect(normalizeUnitNumber('SUITE 200')).toBe('Suite 200');
    });
  });
});