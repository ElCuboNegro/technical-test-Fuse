/**
 * Voice/TTS Fixture Validation Tests
 * 
 * Tests that validate TTS formatting against golden baseline fixtures.
 * These tests ensure consistency between test expectations and fixture data.
 * 
 * Requirements: R3.1, R3.2, R3.3, R3.4
 */

import {
  formatZipForTTS,
  spellEmailForTTS,
  formatAddressForTTS,
  formatAddressConfirmationForTTS,
  AddressData
} from '../../src/utils/voice-formatting';

// Import golden baselines fixture
import goldenBaselines from '../fixtures/contact-information-node/voice_tts_golden_baselines.json';

describe('Voice/TTS Fixture Validation Tests', () => {
  describe('Address Confirmation Baselines', () => {
    it('should match golden baseline for address without unit', () => {
      const { input, expected_tts, expected_confirmation } = goldenBaselines.baselines.address_confirmation.without_unit;

      const ttsResult = formatAddressForTTS(input as AddressData);
      const confirmationResult = formatAddressConfirmationForTTS(input as AddressData);

      expect(ttsResult).toBe(expected_tts);
      expect(confirmationResult).toBe(expected_confirmation);
    });

    it('should match golden baseline for address with unit', () => {
      const { input, expected_tts, expected_confirmation } = goldenBaselines.baselines.address_confirmation.with_unit;

      const ttsResult = formatAddressForTTS(input as AddressData);
      const confirmationResult = formatAddressConfirmationForTTS(input as AddressData);

      expect(ttsResult).toBe(expected_tts);
      expect(confirmationResult).toBe(expected_confirmation);
    });

    it('should match golden baseline for address with ZIP+4', () => {
      const { input, expected_tts, expected_confirmation } = goldenBaselines.baselines.address_confirmation.with_zip_plus_4;

      const ttsResult = formatAddressForTTS(input as AddressData);
      const confirmationResult = formatAddressConfirmationForTTS(input as AddressData);

      expect(ttsResult).toBe(expected_tts);
      expect(confirmationResult).toBe(expected_confirmation);
    });
  });

  describe('ZIP Code Baselines', () => {
    it('should match golden baselines for 5-digit ZIP codes', () => {
      goldenBaselines.baselines.zip_codes.five_digit.forEach(({ input, expected }) => {
        const result = formatZipForTTS(input);
        expect(result).toBe(expected);
      });
    });

    it('should match golden baselines for ZIP+4 codes', () => {
      goldenBaselines.baselines.zip_codes.zip_plus_4.forEach(({ input, expected }) => {
        const result = formatZipForTTS(input);
        expect(result).toBe(expected);
      });
    });

    it('should match golden baselines for edge case ZIP codes', () => {
      goldenBaselines.baselines.zip_codes.edge_cases.forEach(({ input, expected }) => {
        const result = formatZipForTTS(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Email Spelling Baselines', () => {
    it('should match golden baselines for simple email addresses', () => {
      goldenBaselines.baselines.email_spelling.simple.forEach(({ input, expected }) => {
        const result = spellEmailForTTS(input);
        expect(result).toBe(expected);
      });
    });

    it('should match golden baselines for complex email addresses', () => {
      goldenBaselines.baselines.email_spelling.complex.forEach(({ input, expected }) => {
        const result = spellEmailForTTS(input);
        expect(result).toBe(expected);
      });
    });

    it('should match golden baselines for email addresses with special characters', () => {
      goldenBaselines.baselines.email_spelling.special_characters.forEach(({ input, expected }) => {
        const result = spellEmailForTTS(input);
        expect(result).toBe(expected);
      });
    });

    it('should match golden baselines for email addresses with numbers', () => {
      goldenBaselines.baselines.email_spelling.with_numbers.forEach(({ input, expected }) => {
        const result = spellEmailForTTS(input);
        expect(result).toBe(expected);
      });
    });

    it('should match golden baselines for real-world email examples', () => {
      goldenBaselines.baselines.email_spelling.real_world.forEach(({ input, expected }) => {
        const result = spellEmailForTTS(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Formatting Rules Compliance', () => {
    it('should follow address formatting rules from golden baselines', () => {
      const rules = goldenBaselines.formatting_rules.address;

      const testAddress: AddressData = {
        street: '123 Test St',
        city: 'Test City',
        state: 'TX',
        zipCode: '12345',
        unitNumber: 'Apt 1'
      };

      const result = formatAddressForTTS(testAddress);

      // Verify component separator
      expect(result).toContain(rules.component_separator);

      // Verify ZIP format (digit-by-digit with dashes)
      expect(result).toMatch(/\d-\d-\d-\d-\d$/);

      // Verify unit placement (unit should be included in the address)
      expect(result).toContain('Apt 1');

      // Verify address components are properly formatted
      expect(result).toContain('123 Test St');
      expect(result).toContain('Test City');
      expect(result).toContain('TX');
      expect(result).toContain('1-2-3-4-5');
    });

    it('should follow email formatting rules from golden baselines', () => {
      const rules = goldenBaselines.formatting_rules.email;

      const testEmail = 'test.user+tag@example.com';
      const result = spellEmailForTTS(testEmail);

      // Verify special word spacing
      expect(result).toMatch(/\s\sat\s\s/); // " at "
      expect(result).toMatch(/\s\sdot\s\s/); // " dot "
      expect(result).toMatch(/\s\splus\s\s/); // " plus "

      // Verify letter separation
      expect(result).toMatch(/[a-z]-[a-z]/); // letter-letter pattern
    });

    it('should follow ZIP formatting rules from golden baselines', () => {
      const rules = goldenBaselines.formatting_rules.zip;

      // Test 5-digit ZIP
      const fiveDigitResult = formatZipForTTS('12345');
      expect(fiveDigitResult).toMatch(new RegExp(`\\d${rules.digit_separator}\\d${rules.digit_separator}\\d${rules.digit_separator}\\d${rules.digit_separator}\\d`));

      // Test ZIP+4
      const zipPlus4Result = formatZipForTTS('12345-6789');
      expect(zipPlus4Result).toContain(rules.plus_4_separator);

      // Test leading zeros preservation
      const leadingZeroResult = formatZipForTTS('00501');
      expect(leadingZeroResult).toBe('0-0-5-0-1');
    });
  });

  describe('Golden Baseline Integrity', () => {
    it('should have consistent baseline structure', () => {
      // Verify all required sections exist
      expect(goldenBaselines.baselines).toBeDefined();
      expect(goldenBaselines.baselines.address_confirmation).toBeDefined();
      expect(goldenBaselines.baselines.zip_codes).toBeDefined();
      expect(goldenBaselines.baselines.email_spelling).toBeDefined();

      // Verify formatting rules exist
      expect(goldenBaselines.formatting_rules).toBeDefined();
      expect(goldenBaselines.formatting_rules.address).toBeDefined();
      expect(goldenBaselines.formatting_rules.email).toBeDefined();
      expect(goldenBaselines.formatting_rules.zip).toBeDefined();
    });

    it('should have version information', () => {
      expect(goldenBaselines.version).toBeDefined();
      expect(goldenBaselines.last_updated).toBeDefined();
      expect(goldenBaselines.version_history).toBeDefined();
      expect(Array.isArray(goldenBaselines.version_history)).toBe(true);
    });

    it('should have test scenarios documentation', () => {
      expect(goldenBaselines.test_scenarios).toBeDefined();
      expect(goldenBaselines.test_scenarios.approval_test_workflow).toBeDefined();
      expect(goldenBaselines.test_scenarios.voice_interface_validation).toBeDefined();
    });
  });

  describe('Approval Test Workflow Validation', () => {
    /**
     * This test validates that the approval test workflow is properly documented
     * and that the golden baselines can be used for approval testing.
     */

    it('should provide clear approval test workflow', () => {
      const workflow = goldenBaselines.test_scenarios.approval_test_workflow;

      expect(Array.isArray(workflow)).toBe(true);
      expect(workflow.length).toBeGreaterThan(0);

      // Verify workflow includes key steps
      const workflowText = workflow.join(' ').toLowerCase();
      expect(workflowText).toContain('run');
      expect(workflowText).toContain('test');
      expect(workflowText).toContain('update');
      expect(workflowText).toContain('baseline');
    });

    it('should provide voice interface validation guidance', () => {
      const validation = goldenBaselines.test_scenarios.voice_interface_validation;

      expect(Array.isArray(validation)).toBe(true);
      expect(validation.length).toBeGreaterThan(0);

      // Verify validation includes TTS-specific guidance
      const validationText = validation.join(' ').toLowerCase();
      expect(validationText).toContain('tts');
      expect(validationText).toContain('pronunciation');
      expect(validationText).toContain('pause');
    });
  });
});