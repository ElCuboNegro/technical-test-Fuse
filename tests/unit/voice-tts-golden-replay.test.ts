/**
 * Golden Replay Tests for Voice/TTS Formatting
 *
 * Tests exact TTS strings for address confirmation, ZIP codes, and email spelling.
 * These tests serve as approval tests - any TTS formatting change requires updating
 * the golden baselines.
 *
 * Requirements: R3.1, R3.2, R3.3, R3.4
 */

import {
  formatZipForTTS,
  spellEmailForTTS,
  formatAddressForTTS,
  formatAddressConfirmationForTTS,
  AddressData,
} from "../../src/utils/voice-formatting";

describe("Voice/TTS Golden Replay Tests", () => {
  describe("Address Confirmation TTS Strings", () => {
    it("should produce exact TTS string for address without unit", () => {
      const address: AddressData = {
        street: "123 Main Street",
        city: "Anytown",
        state: "CA",
        zipCode: "12345",
      };

      const result = formatAddressForTTS(address);

      // Golden baseline - exact TTS string expected
      expect(result).toBe("123 Main Street, Anytown, CA, 1-2-3-4-5");
    });

    it("should produce exact TTS string for address with unit", () => {
      const address: AddressData = {
        street: "456 Oak Avenue",
        city: "Springfield",
        state: "IL",
        zipCode: "62701",
        unitNumber: "Apt 4B",
      };

      const result = formatAddressForTTS(address);

      // Golden baseline - exact TTS string expected
      expect(result).toBe("456 Oak Avenue, Apt 4B, Springfield, IL, 6-2-7-0-1");
    });

    it("should produce exact TTS string for address confirmation prompt without unit", () => {
      const address: AddressData = {
        street: "789 Pine Road",
        city: "Hometown",
        state: "TX",
        zipCode: "75001",
      };

      const result = formatAddressConfirmationForTTS(address);

      // Golden baseline - exact confirmation prompt expected
      expect(result).toBe(
        "Your mailing address is 789 Pine Road, Hometown, TX, 7-5-0-0-1. Is that correct?",
      );
    });

    it("should produce exact TTS string for address confirmation prompt with unit", () => {
      const address: AddressData = {
        street: "321 Elm Street",
        city: "Riverside",
        state: "FL",
        zipCode: "33101",
        unitNumber: "Suite 200",
      };

      const result = formatAddressConfirmationForTTS(address);

      // Golden baseline - exact confirmation prompt expected
      expect(result).toBe(
        "Your mailing address is 321 Elm Street, Suite 200, Riverside, FL, 3-3-1-0-1. Is that correct?",
      );
    });
  });

  describe("ZIP Code TTS Strings", () => {
    it("should produce exact TTS string for 5-digit ZIP codes", () => {
      // Golden baselines for common ZIP codes
      expect(formatZipForTTS("12345")).toBe("1-2-3-4-5");
      expect(formatZipForTTS("90210")).toBe("9-0-2-1-0");
      expect(formatZipForTTS("00501")).toBe("0-0-5-0-1");
      expect(formatZipForTTS("80202")).toBe("8-0-2-0-2");
      expect(formatZipForTTS("10001")).toBe("1-0-0-0-1");
    });

    it("should produce exact TTS string for ZIP+4 codes", () => {
      // Golden baselines for ZIP+4 format
      expect(formatZipForTTS("12345-6789")).toBe("1-2-3-4-5, dash, 6-7-8-9");
      expect(formatZipForTTS("90210-1234")).toBe("9-0-2-1-0, dash, 1-2-3-4");
      expect(formatZipForTTS("00501-0001")).toBe("0-0-5-0-1, dash, 0-0-0-1");
      expect(formatZipForTTS("80202-4567")).toBe("8-0-2-0-2, dash, 4-5-6-7");
      expect(formatZipForTTS("10001-9999")).toBe("1-0-0-0-1, dash, 9-9-9-9");
    });

    it("should produce exact TTS string for edge case ZIP codes", () => {
      // Golden baselines for edge cases
      expect(formatZipForTTS("00000")).toBe("0-0-0-0-0");
      expect(formatZipForTTS("99999")).toBe("9-9-9-9-9");
      expect(formatZipForTTS("00000-0000")).toBe("0-0-0-0-0, dash, 0-0-0-0");
      expect(formatZipForTTS("99999-9999")).toBe("9-9-9-9-9, dash, 9-9-9-9");
    });
  });

  describe("Email Spelling TTS Strings", () => {
    it("should produce exact TTS string for simple email addresses", () => {
      // Golden baselines for common email patterns
      expect(spellEmailForTTS("user@example.com")).toBe(
        "u-s-e-r  at  e-x-a-m-p-l-e  dot  c-o-m",
      );
      expect(spellEmailForTTS("test@domain.org")).toBe(
        "t-e-s-t  at  d-o-m-a-i-n  dot  o-r-g",
      );
      expect(spellEmailForTTS("info@company.net")).toBe(
        "i-n-f-o  at  c-o-m-p-a-n-y  dot  n-e-t",
      );
    });

    it("should produce exact TTS string for complex email addresses", () => {
      // Golden baselines for complex email patterns
      expect(spellEmailForTTS("mike.smith@gmail.com")).toBe(
        "m-i-k-e  dot  s-m-i-t-h  at  g-m-a-i-l  dot  c-o-m",
      );
      expect(spellEmailForTTS("john.doe+work@company.co.uk")).toBe(
        "j-o-h-n  dot  d-o-e  plus  w-o-r-k  at  c-o-m-p-a-n-y  dot  c-o  dot  u-k",
      );
      expect(spellEmailForTTS("firstname.lastname@subdomain.example.com")).toBe(
        "f-i-r-s-t-n-a-m-e  dot  l-a-s-t-n-a-m-e  at  s-u-b-d-o-m-a-i-n  dot  e-x-a-m-p-l-e  dot  c-o-m",
      );
    });

    it("should produce exact TTS string for email addresses with special characters", () => {
      // Golden baselines for special character handling
      expect(spellEmailForTTS("user+tag@example.com")).toBe(
        "u-s-e-r  plus  t-a-g  at  e-x-a-m-p-l-e  dot  c-o-m",
      );
      expect(spellEmailForTTS("user-name@example.com")).toBe(
        "u-s-e-r  dash  n-a-m-e  at  e-x-a-m-p-l-e  dot  c-o-m",
      );
      expect(spellEmailForTTS("user_name@example.com")).toBe(
        "u-s-e-r  underscore  n-a-m-e  at  e-x-a-m-p-l-e  dot  c-o-m",
      );
    });

    it("should produce exact TTS string for email addresses with numbers", () => {
      // Golden baselines for numeric handling
      expect(spellEmailForTTS("user123@example.com")).toBe(
        "u-s-e-r 1-2-3  at  e-x-a-m-p-l-e  dot  c-o-m",
      );
      expect(spellEmailForTTS("test2024@domain.org")).toBe(
        "t-e-s-t 2-0-2-4  at  d-o-m-a-i-n  dot  o-r-g",
      );
      expect(spellEmailForTTS("user1@example2.com")).toBe(
        "u-s-e-r 1  at  e-x-a-m-p-l-e 2  dot  c-o-m",
      );
    });

    it("should produce exact TTS string for real-world email examples", () => {
      // Golden baselines for realistic email addresses from fixtures
      expect(spellEmailForTTS("mthompson.denver@gmail.com")).toBe(
        "m-t-h-o-m-p-s-o-n  dot  d-e-n-v-e-r  at  g-m-a-i-l  dot  c-o-m",
      );
      expect(spellEmailForTTS("sarah.johnson+personal@outlook.com")).toBe(
        "s-a-r-a-h  dot  j-o-h-n-s-o-n  plus  p-e-r-s-o-n-a-l  at  o-u-t-l-o-o-k  dot  c-o-m",
      );
      expect(spellEmailForTTS("contact@business-solutions.co")).toBe(
        "c-o-n-t-a-c-t  at  b-u-s-i-n-e-s-s  dash  s-o-l-u-t-i-o-n-s  dot  c-o",
      );
    });
  });

  describe("Golden Baseline Approval Tests", () => {
    /**
     * These tests serve as approval tests for TTS formatting changes.
     * Any modification to TTS formatting logic should be reflected here.
     *
     * When TTS formatting changes:
     * 1. Update the expected golden baselines below
     * 2. Verify the new TTS output is correct for voice interfaces
     * 3. Update this test file to reflect the new expected outputs
     */

    it("should maintain consistent TTS formatting across all address components", () => {
      const testAddresses: AddressData[] = [
        {
          street: "1247 Oak Street",
          city: "Denver",
          state: "CO",
          zipCode: "80202",
        },
        {
          street: "456 Elm Avenue",
          city: "Springfield",
          state: "IL",
          zipCode: "62701-1234",
          unitNumber: "Apt 3B",
        },
        {
          street: "789 Pine Road",
          city: "Riverside",
          state: "CA",
          zipCode: "92501",
        },
      ];

      const expectedResults = [
        "1247 Oak Street, Denver, CO, 8-0-2-0-2",
        "456 Elm Avenue, Apt 3B, Springfield, IL, 6-2-7-0-1, dash, 1-2-3-4",
        "789 Pine Road, Riverside, CA, 9-2-5-0-1",
      ];

      testAddresses.forEach((address, index) => {
        const result = formatAddressForTTS(address);
        expect(result).toBe(expectedResults[index]);
      });
    });

    it("should maintain consistent email spelling format across all patterns", () => {
      const testEmails = [
        "simple@test.com",
        "complex.email+tag@domain.co.uk",
        "user123@example.org",
        "first-last_name@sub.domain.net",
      ];

      const expectedResults = [
        "s-i-m-p-l-e  at  t-e-s-t  dot  c-o-m",
        "c-o-m-p-l-e-x  dot  e-m-a-i-l  plus  t-a-g  at  d-o-m-a-i-n  dot  c-o  dot  u-k",
        "u-s-e-r 1-2-3  at  e-x-a-m-p-l-e  dot  o-r-g",
        "f-i-r-s-t  dash  l-a-s-t  underscore  n-a-m-e  at  s-u-b  dot  d-o-m-a-i-n  dot  n-e-t",
      ];

      testEmails.forEach((email, index) => {
        const result = spellEmailForTTS(email);
        expect(result).toBe(expectedResults[index]);
      });
    });

    it("should maintain consistent ZIP code formatting across all patterns", () => {
      const testZipCodes = [
        "12345",
        "90210",
        "00501",
        "12345-6789",
        "90210-1234",
        "00000-0000",
      ];

      const expectedResults = [
        "1-2-3-4-5",
        "9-0-2-1-0",
        "0-0-5-0-1",
        "1-2-3-4-5, dash, 6-7-8-9",
        "9-0-2-1-0, dash, 1-2-3-4",
        "0-0-0-0-0, dash, 0-0-0-0",
      ];

      testZipCodes.forEach((zipCode, index) => {
        const result = formatZipForTTS(zipCode);
        expect(result).toBe(expectedResults[index]);
      });
    });
  });

  describe("TTS Formatting Change Detection", () => {
    /**
     * These tests will fail if TTS formatting logic changes.
     * This is intentional - it forces developers to consciously update
     * golden baselines when making TTS formatting changes.
     */

    it("should detect changes to address confirmation formatting", () => {
      const address: AddressData = {
        street: "123 Test Street",
        city: "Test City",
        state: "TX",
        zipCode: "12345",
        unitNumber: "Unit 1",
      };

      // This exact string is the golden baseline
      const expectedGoldenBaseline =
        "Your mailing address is 123 Test Street, Unit 1, Test City, TX, 1-2-3-4-5. Is that correct?";

      const result = formatAddressConfirmationForTTS(address);

      // If this test fails, TTS formatting has changed and golden baselines need updating
      expect(result).toBe(expectedGoldenBaseline);
    });

    it("should detect changes to email spelling formatting", () => {
      const testEmail = "test.user+tag@example.com";

      // This exact string is the golden baseline
      const expectedGoldenBaseline =
        "t-e-s-t  dot  u-s-e-r  plus  t-a-g  at  e-x-a-m-p-l-e  dot  c-o-m";

      const result = spellEmailForTTS(testEmail);

      // If this test fails, TTS formatting has changed and golden baselines need updating
      expect(result).toBe(expectedGoldenBaseline);
    });

    it("should detect changes to ZIP code formatting", () => {
      const testZipCode = "12345-6789";

      // This exact string is the golden baseline
      const expectedGoldenBaseline = "1-2-3-4-5, dash, 6-7-8-9";

      const result = formatZipForTTS(testZipCode);

      // If this test fails, TTS formatting has changed and golden baselines need updating
      expect(result).toBe(expectedGoldenBaseline);
    });
  });

  describe("Voice Interface Compatibility", () => {
    /**
     * These tests verify that TTS strings are optimized for voice interfaces
     * and maintain consistent formatting patterns.
     */

    it("should use consistent pause patterns in address formatting", () => {
      const address: AddressData = {
        street: "123 Main St",
        city: "Anytown",
        state: "CA",
        zipCode: "12345",
      };

      const result = formatAddressForTTS(address);

      // Verify comma-separated components for natural TTS pauses
      expect(result).toMatch(/^[^,]+, [^,]+, [^,]+, \d-\d-\d-\d-\d$/);
      expect(result.split(", ")).toHaveLength(4); // street, city, state, zip
    });

    it("should use consistent spacing patterns in email spelling", () => {
      const email = "user@example.com";
      const result = spellEmailForTTS(email);

      // Verify double spaces around special words for TTS pauses
      expect(result).toMatch(/\s\sat\s\s/); // " at "
      expect(result).toMatch(/\s\sdot\s\s/); // " dot "

      // Verify letter separation with single dashes
      expect(result).toMatch(/[a-z]-[a-z]/); // letter-letter pattern
    });

    it("should use consistent digit separation in ZIP codes", () => {
      const zipCode = "12345";
      const result = formatZipForTTS(zipCode);

      // Verify single dash separation between digits
      expect(result).toMatch(/^\d-\d-\d-\d-\d$/);
      expect(result.split("-")).toHaveLength(5); // 5 digits
    });
  });
});
