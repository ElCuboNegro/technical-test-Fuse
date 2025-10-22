/**
 * Email Validation & Normalization Unit Tests
 * 
 * Tests for email validation, normalization, and extraction utilities
 * used by the contact information node.
 * 
 * Requirements: R2.1, R2.2, R6.2
 */

import {
  validateEmail,
  normalizeEmail,
  extractEmailFromText,
  isCommonEmailDomain
} from '../../src/utils/email-validation';

describe('Email Validation & Normalization', () => {
  describe('validateEmail', () => {
    it('should validate properly formatted email addresses', () => {
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('test.email@domain.org')).toBe(true);
      expect(validateEmail('user+tag@example.co.uk')).toBe(true);
      expect(validateEmail('firstname.lastname@company.com')).toBe(true);
      expect(validateEmail('user123@test-domain.net')).toBe(true);
    });

    it('should validate email with whitespace that gets trimmed', () => {
      expect(validateEmail('  MiKe.Smith+dev@Gmail.com ')).toBe(true);
      expect(validateEmail('\tuser@example.com\n')).toBe(true);
      expect(validateEmail('   test@domain.org   ')).toBe(true);
    });

    it('should reject invalid email formats', () => {
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('@domain.com')).toBe(false);
      expect(validateEmail('user@@domain.com')).toBe(false);
      expect(validateEmail('user@domain')).toBe(false);
      expect(validateEmail('user.domain.com')).toBe(false);
      expect(validateEmail('')).toBe(false);
      expect(validateEmail('   ')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(validateEmail(null as any)).toBe(false);
      expect(validateEmail(undefined as any)).toBe(false);
      expect(validateEmail(123 as any)).toBe(false);
      expect(validateEmail({} as any)).toBe(false);
    });

    it('should validate complex but valid email formats', () => {
      expect(validateEmail('user.name+tag+sorting@example.com')).toBe(true);
      expect(validateEmail('x@example.com')).toBe(true);
      expect(validateEmail('example@s.example')).toBe(true);
      expect(validateEmail('test@example-one.com')).toBe(true);
      expect(validateEmail('test@123.123.123.123')).toBe(true);
    });
  });

  describe('normalizeEmail', () => {
    it('should trim whitespace and convert to lowercase', () => {
      expect(normalizeEmail('  MiKe.Smith+dev@Gmail.com ')).toBe('mike.smith+dev@gmail.com');
      expect(normalizeEmail('USER@EXAMPLE.COM')).toBe('user@example.com');
      expect(normalizeEmail('\tTest.Email@Domain.Org\n')).toBe('test.email@domain.org');
    });

    it('should preserve email structure while normalizing', () => {
      expect(normalizeEmail('User.Name+Tag@Example.Com')).toBe('user.name+tag@example.com');
      expect(normalizeEmail('FirstName.LastName@Company.Co.Uk')).toBe('firstname.lastname@company.co.uk');
    });

    it('should handle already normalized emails', () => {
      expect(normalizeEmail('user@example.com')).toBe('user@example.com');
      expect(normalizeEmail('test.email@domain.org')).toBe('test.email@domain.org');
    });

    it('should handle edge cases', () => {
      expect(normalizeEmail('')).toBe('');
      expect(normalizeEmail('   ')).toBe('');
      expect(normalizeEmail(null as any)).toBe('');
      expect(normalizeEmail(undefined as any)).toBe('');
    });

    it('should preserve special characters in email addresses', () => {
      expect(normalizeEmail('User+Tag@Example.Com')).toBe('user+tag@example.com');
      expect(normalizeEmail('User.Name-Test@Sub-Domain.Example.Com')).toBe('user.name-test@sub-domain.example.com');
    });
  });

  describe('extractEmailFromText', () => {
    it('should extract email from simple text', () => {
      expect(extractEmailFromText('My email is user@example.com')).toBe('user@example.com');
      expect(extractEmailFromText('Contact me at test.email@domain.org')).toBe('test.email@domain.org');
    });

    it('should extract email from complex text', () => {
      expect(extractEmailFromText('You can reach me at mike.smith+dev@gmail.com for work stuff')).toBe('mike.smith+dev@gmail.com');
      expect(extractEmailFromText('Email: firstname.lastname@company.co.uk Phone: 555-1234')).toBe('firstname.lastname@company.co.uk');
    });

    it('should extract first email when multiple are present', () => {
      expect(extractEmailFromText('Primary: user@example.com Secondary: backup@test.org')).toBe('user@example.com');
    });

    it('should return null when no email is found', () => {
      expect(extractEmailFromText('No email address here')).toBe(null);
      expect(extractEmailFromText('Contact me at phone number 555-1234')).toBe(null);
      expect(extractEmailFromText('')).toBe(null);
      expect(extractEmailFromText('   ')).toBe(null);
    });

    it('should handle edge cases', () => {
      expect(extractEmailFromText(null as any)).toBe(null);
      expect(extractEmailFromText(undefined as any)).toBe(null);
    });

    it('should extract emails with various formats', () => {
      expect(extractEmailFromText('Email me at user+tag@example.com')).toBe('user+tag@example.com');
      expect(extractEmailFromText('My work email is firstname.lastname@company-name.com')).toBe('firstname.lastname@company-name.com');
      expect(extractEmailFromText('Reach out to test123@sub.domain.org')).toBe('test123@sub.domain.org');
    });
  });

  describe('isCommonEmailDomain', () => {
    it('should identify common email domains', () => {
      expect(isCommonEmailDomain('user@gmail.com')).toBe(true);
      expect(isCommonEmailDomain('test@yahoo.com')).toBe(true);
      expect(isCommonEmailDomain('email@hotmail.com')).toBe(true);
      expect(isCommonEmailDomain('user@outlook.com')).toBe(true);
      expect(isCommonEmailDomain('test@aol.com')).toBe(true);
      expect(isCommonEmailDomain('user@icloud.com')).toBe(true);
      expect(isCommonEmailDomain('test@comcast.net')).toBe(true);
      expect(isCommonEmailDomain('user@verizon.net')).toBe(true);
    });

    it('should be case insensitive for domains', () => {
      expect(isCommonEmailDomain('user@GMAIL.COM')).toBe(true);
      expect(isCommonEmailDomain('test@Yahoo.Com')).toBe(true);
      expect(isCommonEmailDomain('email@HotMail.COM')).toBe(true);
    });

    it('should identify uncommon domains', () => {
      expect(isCommonEmailDomain('user@company.com')).toBe(false);
      expect(isCommonEmailDomain('test@university.edu')).toBe(false);
      expect(isCommonEmailDomain('email@government.gov')).toBe(false);
      expect(isCommonEmailDomain('user@custom-domain.org')).toBe(false);
    });

    it('should handle invalid email formats', () => {
      expect(isCommonEmailDomain('invalid-email')).toBe(false);
      expect(isCommonEmailDomain('user@')).toBe(false);
      expect(isCommonEmailDomain('@gmail.com')).toBe(false);
      expect(isCommonEmailDomain('')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isCommonEmailDomain(null as any)).toBe(false);
      expect(isCommonEmailDomain(undefined as any)).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete email processing workflow', () => {
      const rawInput = '  MiKe.Smith+dev@Gmail.com ';
      
      // First validate
      expect(validateEmail(rawInput)).toBe(true);
      
      // Then normalize
      const normalized = normalizeEmail(rawInput);
      expect(normalized).toBe('mike.smith+dev@gmail.com');
      
      // Check if common domain
      expect(isCommonEmailDomain(normalized)).toBe(true);
    });

    it('should handle text extraction and processing', () => {
      const conversationText = 'You can reach me at John.Doe+Work@GMAIL.COM for business inquiries';
      
      // Extract email
      const extracted = extractEmailFromText(conversationText);
      expect(extracted).toBe('John.Doe+Work@GMAIL.COM');
      
      // Validate extracted email
      expect(validateEmail(extracted!)).toBe(true);
      
      // Normalize extracted email
      const normalized = normalizeEmail(extracted!);
      expect(normalized).toBe('john.doe+work@gmail.com');
      
      // Check domain
      expect(isCommonEmailDomain(normalized)).toBe(true);
    });

    it('should handle invalid email gracefully in workflow', () => {
      const invalidInput = 'invalid-email-format';
      
      // Validation should fail
      expect(validateEmail(invalidInput)).toBe(false);
      
      // Normalization should still work (return empty or handle gracefully)
      const normalized = normalizeEmail(invalidInput);
      expect(normalized).toBe('invalid-email-format');
      
      // Domain check should fail
      expect(isCommonEmailDomain(invalidInput)).toBe(false);
    });
  });
});