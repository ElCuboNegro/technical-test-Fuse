/**
 * Address Validation Utilities Unit Tests
 * 
 * Tests for address validation, normalization, and formatting utilities
 * used by the contact information node.
 * 
 * Requirements: R1.1, R1.2, R1.3, R1.4
 */

import {
  normalizeAddress,
  validateState,
  validateZipCode,
  validateAddress,
  detectMultiUnitAddress,
  handleUnitNumber
} from '../../src/utils/address-validation';

describe('Address Validation Utilities', () => {
  describe('normalizeAddress', () => {
    it('should trim fields and uppercase state', () => {
      const input = {
        street: '  123 Main St  ',
        city: '  Anytown  ',
        state: '  ca  ',
        zipCode: '  12345  ',
        unitNumber: '  Apt 4B  '
      };

      const result = normalizeAddress(input);

      expect(result.street).toBe('123 Main St');
      expect(result.city).toBe('Anytown');
      expect(result.state).toBe('CA');
      expect(result.zipCode).toBe('12345');
      expect(result.unitNumber).toBe('Apt 4B');
    });

    it('should handle missing unit number', () => {
      const input = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'ca',
        zipCode: '12345'
      };

      const result = normalizeAddress(input);

      expect(result.unitNumber).toBeUndefined();
    });

    it('should normalize ZIP+4 format', () => {
      const input = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'ca',
        zipCode: '12345-6789'
      };

      const result = normalizeAddress(input);

      expect(result.zipCode).toBe('12345-6789');
    });

    it('should remove extra spaces from ZIP code', () => {
      const input = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'ca',
        zipCode: '12345  '
      };

      const result = normalizeAddress(input);

      expect(result.zipCode).toBe('12345');
    });
  });

  describe('validateState', () => {
    it('should validate valid state codes', () => {
      expect(validateState('ca')).toBe(true);
      expect(validateState('CA')).toBe(true);
      expect(validateState('ny')).toBe(true);
      expect(validateState('NY')).toBe(true);
      expect(validateState('tx')).toBe(true);
      expect(validateState('TX')).toBe(true);
      expect(validateState('fl')).toBe(true);
      expect(validateState('FL')).toBe(true);
      expect(validateState('dc')).toBe(true);
      expect(validateState('DC')).toBe(true);
    });

    it('should reject invalid state codes', () => {
      expect(validateState('XX')).toBe(false);
      expect(validateState('ZZ')).toBe(false);
      expect(validateState('123')).toBe(false);
      expect(validateState('CAL')).toBe(false);
      expect(validateState('')).toBe(false);
      expect(validateState('C')).toBe(false);
    });

    it('should handle all 50 states plus DC', () => {
      const validStates = [
        'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
        'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
        'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
        'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
        'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
        'DC'
      ];

      validStates.forEach(state => {
        expect(validateState(state)).toBe(true);
        expect(validateState(state.toLowerCase())).toBe(true);
      });
    });
  });

  describe('validateZipCode', () => {
    it('should validate 5-digit ZIP codes', () => {
      expect(validateZipCode('12345')).toBe(true);
      expect(validateZipCode('90210')).toBe(true);
      expect(validateZipCode('00501')).toBe(true);
    });

    it('should validate ZIP+4 format', () => {
      expect(validateZipCode('12345-6789')).toBe(true);
      expect(validateZipCode('90210-1234')).toBe(true);
      expect(validateZipCode('00501-0001')).toBe(true);
    });

    it('should reject invalid ZIP formats', () => {
      expect(validateZipCode('1234')).toBe(false);
      expect(validateZipCode('123456')).toBe(false);
      expect(validateZipCode('12345-678')).toBe(false);
      expect(validateZipCode('12345-67890')).toBe(false);
      expect(validateZipCode('abcde')).toBe(false);
      expect(validateZipCode('12345-abcd')).toBe(false);
      expect(validateZipCode('')).toBe(false);
      expect(validateZipCode('12345 6789')).toBe(false);
    });
  });

  describe('validateAddress', () => {
    it('should validate complete valid address', () => {
      const address = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345'
      };

      expect(validateAddress(address)).toBe(true);
    });

    it('should validate address with unit number', () => {
      const address = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345',
        unitNumber: 'Apt 4B'
      };

      expect(validateAddress(address)).toBe(true);
    });

    it('should validate address with ZIP+4', () => {
      const address = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345-6789'
      };

      expect(validateAddress(address)).toBe(true);
    });

    it('should reject address with missing street', () => {
      const address = {
        street: '',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345'
      };

      expect(validateAddress(address)).toBe(false);
    });

    it('should reject address with missing city', () => {
      const address = {
        street: '123 Main St',
        city: '',
        state: 'CA',
        zipCode: '12345'
      };

      expect(validateAddress(address)).toBe(false);
    });

    it('should reject address with invalid state', () => {
      const address = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'XX',
        zipCode: '12345'
      };

      expect(validateAddress(address)).toBe(false);
    });

    it('should reject address with invalid ZIP code', () => {
      const address = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '1234'
      };

      expect(validateAddress(address)).toBe(false);
    });

    it('should handle undefined or null values', () => {
      expect(validateAddress(null)).toBe(false);
      expect(validateAddress(undefined)).toBe(false);
      expect(validateAddress({})).toBe(false);
    });
  });

  describe('detectMultiUnitAddress', () => {
    it('should detect apartment indicators', () => {
      expect(detectMultiUnitAddress('2580 Broadway St Apt 15F')).toBe(true);
      expect(detectMultiUnitAddress('123 Main St Apartment 4B')).toBe(true);
      expect(detectMultiUnitAddress('456 Oak Ave APT 2')).toBe(true);
    });

    it('should detect suite indicators', () => {
      expect(detectMultiUnitAddress('789 Business Blvd Suite 100')).toBe(true);
      expect(detectMultiUnitAddress('321 Office St Ste 5')).toBe(true);
      expect(detectMultiUnitAddress('654 Corporate Dr STE 200')).toBe(true);
    });

    it('should detect unit indicators', () => {
      expect(detectMultiUnitAddress('987 Residential Way Unit 3')).toBe(true);
      expect(detectMultiUnitAddress('147 Complex Rd UNIT 12')).toBe(true);
    });

    it('should detect building indicators', () => {
      expect(detectMultiUnitAddress('258 Campus Dr Building A')).toBe(true);
      expect(detectMultiUnitAddress('369 Industrial Pkwy Bldg 5')).toBe(true);
    });

    it('should detect number sign indicators', () => {
      expect(detectMultiUnitAddress('741 Street Name #15')).toBe(true);
      expect(detectMultiUnitAddress('852 Avenue Name # 8')).toBe(true);
    });

    it('should not detect single-unit addresses', () => {
      expect(detectMultiUnitAddress('123 Main St')).toBe(false);
      expect(detectMultiUnitAddress('456 Oak Avenue')).toBe(false);
      expect(detectMultiUnitAddress('789 Simple Road')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(detectMultiUnitAddress('123 main st apt 4')).toBe(true);
      expect(detectMultiUnitAddress('456 OAK AVE SUITE 2')).toBe(true);
      expect(detectMultiUnitAddress('789 Mixed Case Unit 3')).toBe(true);
    });
  });

  describe('handleUnitNumber', () => {
    it('should prompt for unit number when not already asked and multi-unit detected', async () => {
      const address = {
        street: '2580 Broadway St Apt 15F',
        city: 'New York',
        state: 'NY',
        zipCode: '10025'
      };

      const result = await handleUnitNumber(address, false);

      expect(result.unitNumberAsked).toBe(true);
      expect(result.needsUnitPrompt).toBe(true);
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
    });

    it('should preserve existing unit number', async () => {
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
  });
});