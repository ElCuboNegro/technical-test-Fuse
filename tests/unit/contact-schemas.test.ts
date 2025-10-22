/**
 * Tests for Contact Information Zod Schemas
 * 
 * Tests the Zod schemas used for structured extraction of address and email data
 * from conversation text via LLM structured output.
 */

import {
  AddressExtract,
  EmailExtract,
  ContactExtract,
  validateAddressData,
  validateEmailData,
  SchemaCoercion,
  type AddressExtractType,
  type EmailExtractType,
  type ContactExtractType
} from '../../src/utils/contact-schemas';

describe('Contact Information Zod Schemas', () => {
  describe('AddressExtract schema', () => {
    it('should validate complete valid address', () => {
      const validAddress = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345',
        unitNumber: 'Apt 4B'
      };

      const result = AddressExtract.parse(validAddress);
      expect(result).toEqual({
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345',
        unitNumber: 'Apt 4B'
      });
    });

    it('should validate address without unit number', () => {
      const validAddress = {
        street: '456 Oak Ave',
        city: 'Springfield',
        state: 'il',
        zipCode: '62701'
      };

      const result = AddressExtract.parse(validAddress);
      expect(result).toEqual({
        street: '456 Oak Ave',
        city: 'Springfield',
        state: 'IL', // Should be uppercased
        zipCode: '62701',
        unitNumber: undefined
      });
    });

    it('should validate ZIP+4 format', () => {
      const validAddress = {
        street: '789 Pine Rd',
        city: 'Hometown',
        state: 'TX',
        zipCode: '75001-1234'
      };

      const result = AddressExtract.parse(validAddress);
      expect(result.zipCode).toBe('75001-1234');
    });

    it('should transform and normalize data', () => {
      const addressWithWhitespace = {
        street: '  123 Main St  ',
        city: '  Anytown  ',
        state: '  ca  ',
        zipCode: ' 12345 ',
        unitNumber: '  Apt 4B  '
      };

      const result = AddressExtract.parse(addressWithWhitespace);
      expect(result).toEqual({
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345',
        unitNumber: 'Apt 4B'
      });
    });

    it('should reject invalid state codes', () => {
      const invalidAddress = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'XX',
        zipCode: '12345'
      };

      expect(() => AddressExtract.parse(invalidAddress)).toThrow();
    });

    it('should reject invalid ZIP codes', () => {
      const invalidAddress = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '1234' // Too short
      };

      expect(() => AddressExtract.parse(invalidAddress)).toThrow();
    });

    it('should reject missing required fields', () => {
      const incompleteAddress = {
        street: '123 Main St',
        city: 'Anytown'
        // Missing state and zipCode
      };

      expect(() => AddressExtract.parse(incompleteAddress)).toThrow();
    });

    it('should handle empty unit number', () => {
      const addressWithEmptyUnit = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345',
        unitNumber: ''
      };

      const result = AddressExtract.parse(addressWithEmptyUnit);
      expect(result.unitNumber).toBeUndefined();
    });
  });

  describe('EmailExtract schema', () => {
    it('should validate proper email format', () => {
      const validEmail = {
        email: 'user@example.com'
      };

      const result = EmailExtract.parse(validEmail);
      expect(result).toEqual({
        email: 'user@example.com'
      });
    });

    it('should normalize email to lowercase', () => {
      const emailWithCase = {
        email: 'USER@EXAMPLE.COM'
      };

      const result = EmailExtract.parse(emailWithCase);
      expect(result.email).toBe('user@example.com');
    });

    it('should trim whitespace from email', () => {
      const emailWithWhitespace = {
        email: '  user@example.com  '
      };

      const result = EmailExtract.parse(emailWithWhitespace);
      expect(result.email).toBe('user@example.com');
    });

    it('should handle optional email', () => {
      const noEmail = {};

      const result = EmailExtract.parse(noEmail);
      expect(result.email).toBeUndefined();
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        { email: 'invalid-email' },
        { email: '@domain.com' },
        { email: 'user@' },
        { email: 'user@@domain.com' }
      ];

      invalidEmails.forEach(invalidEmail => {
        expect(() => EmailExtract.parse(invalidEmail)).toThrow();
      });
    });

    it('should handle complex valid email formats', () => {
      const complexEmails = [
        { email: 'user.name+tag@example.com' },
        { email: 'user_name@example-domain.com' },
        { email: 'user123@example123.co.uk' }
      ];

      complexEmails.forEach(emailData => {
        expect(() => EmailExtract.parse(emailData)).not.toThrow();
      });
    });
  });

  describe('ContactExtract schema', () => {
    it('should validate complete contact information', () => {
      const validContact = {
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
          unitNumber: 'Apt 4B'
        },
        email: 'user@example.com'
      };

      const result = ContactExtract.parse(validContact);
      expect(result.address.street).toBe('123 Main St');
      expect(result.email).toBe('user@example.com');
    });

    it('should validate contact without email', () => {
      const contactWithoutEmail = {
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345'
        }
      };

      const result = ContactExtract.parse(contactWithoutEmail);
      expect(result.address.street).toBe('123 Main St');
      expect(result.email).toBeUndefined();
    });
  });

  describe('validateAddressData function', () => {
    it('should return success for valid address', () => {
      const validAddress = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345'
      };

      const result = validateAddressData(validAddress);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it('should return errors for invalid address', () => {
      const invalidAddress = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'XX', // Invalid state
        zipCode: '1234' // Invalid ZIP
      };

      const result = validateAddressData(invalidAddress);
      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should handle non-object input', () => {
      const result = validateAddressData('not an object');
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('validateEmailData function', () => {
    it('should return success for valid email', () => {
      const validEmail = {
        email: 'user@example.com'
      };

      const result = validateEmailData(validEmail);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it('should return errors for invalid email', () => {
      const invalidEmail = {
        email: 'invalid-email'
      };

      const result = validateEmailData(invalidEmail);
      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.errors).toBeDefined();
    });

    it('should handle optional email', () => {
      const noEmail = {};

      const result = validateEmailData(noEmail);
      expect(result.success).toBe(true);
      expect(result.data?.email).toBeUndefined();
    });
  });

  describe('SchemaCoercion utilities', () => {
    describe('coerceAddress', () => {
      it('should coerce address data with proper formatting', () => {
        const rawData = {
          street: '  123 Main St  ',
          city: '  Anytown  ',
          state: '  ca  ',
          zipCode: ' 12 345 ',
          unitNumber: '  Apt 4B  '
        };

        const result = SchemaCoercion.coerceAddress(rawData);
        expect(result).toEqual({
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
          unitNumber: 'Apt 4B'
        });
      });

      it('should handle missing fields gracefully', () => {
        const partialData = {
          street: '123 Main St',
          city: 'Anytown'
        };

        const result = SchemaCoercion.coerceAddress(partialData);
        expect(result.street).toBe('123 Main St');
        expect(result.city).toBe('Anytown');
        expect(result.state).toBeUndefined();
      });

      it('should handle non-string values', () => {
        const mixedData = {
          street: 123,
          city: null,
          state: 'CA'
        };

        const result = SchemaCoercion.coerceAddress(mixedData);
        expect(result.street).toBe('123');
        expect(result.city).toBeUndefined(); // null values are excluded
        expect(result.state).toBe('CA');
      });
    });

    describe('coerceEmail', () => {
      it('should coerce email data with normalization', () => {
        const rawData = {
          email: '  USER@EXAMPLE.COM  '
        };

        const result = SchemaCoercion.coerceEmail(rawData);
        expect(result.email).toBe('user@example.com');
      });

      it('should handle missing email', () => {
        const noEmail = {};

        const result = SchemaCoercion.coerceEmail(noEmail);
        expect(result).toEqual({});
      });

      it('should handle non-string email', () => {
        const nonStringEmail = {
          email: 123
        };

        const result = SchemaCoercion.coerceEmail(nonStringEmail);
        expect(result.email).toBe('123');
      });
    });
  });

  describe('type safety', () => {
    it('should provide correct TypeScript types', () => {
      const address: AddressExtractType = {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345',
        unitNumber: 'Apt 4B'
      };

      const email: EmailExtractType = {
        email: 'user@example.com'
      };

      const contact: ContactExtractType = {
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345'
        },
        email: 'user@example.com'
      };

      // These should compile without errors
      expect(address.street).toBe('123 Main St');
      expect(email.email).toBe('user@example.com');
      expect(contact.address.city).toBe('Anytown');
    });
  });
});