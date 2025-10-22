/**
 * Unit tests for PseudonymizationEngine
 * Tests deterministic hashing, PII masking, fail-closed behavior, and salt rotation
 * Requirements: 1.1, 1.4, 1.5, 6.1, 6.2, 6.3, 6.4, 6.5, 7.5
 */

import {
  PseudonymizationEngine,
  PseudonymizationResult,
  EmailPseudonymizationResult,
} from "../../src/conversation-logging/interfaces/pseudonymization-engine";
import { PseudonymizationEngineImpl } from "../../src/conversation-logging/engines/pseudonymization-engine";

// Test implementation extending the real implementation for testing purposes
class TestPseudonymizationEngine extends PseudonymizationEngineImpl {
  constructor() {
    super({
      currentSalt: "test-salt-v1",
      dualReadMode: false,
      preserveEmailDomains: true,
    });
  }

  // Test helper methods to access private state
  getCurrentSalt(): string {
    return this.getConfig().currentSalt;
  }

  getPreviousSalt(): string {
    return this.getConfig().previousSalt || "";
  }

  isDualReadActive(): boolean {
    return this.getConfig().dualReadMode;
  }
}

describe("PseudonymizationEngine", () => {
  let engine: TestPseudonymizationEngine;

  beforeEach(() => {
    engine = new TestPseudonymizationEngine();
  });

  describe("Deterministic Hashing", () => {
    it("should produce same hash for same input with same salt", async () => {
      const input = "1234";
      const result1 = await engine.maskSSN(input);
      const result2 = await engine.maskSSN(input);

      expect(result1.hash).toBe(result2.hash);
      expect(result1.masked).toBe(result2.masked);
    });

    it("should produce different hashes for different inputs", async () => {
      const result1 = await engine.maskSSN("1234");
      const result2 = await engine.maskSSN("5678");

      expect(result1.hash).not.toBe(result2.hash);
      expect(result1.masked).toBe(result2.masked); // Both should be masked as ****
    });

    it("should produce different hashes after salt rotation", async () => {
      const input = "1234";
      const result1 = await engine.maskSSN(input);

      await engine.rotateSalts();

      const result2 = await engine.maskSSN(input);
      expect(result1.hash).not.toBe(result2.hash);
    });
  });

  describe("SSN Masking", () => {
    it("should mask SSN as ****", async () => {
      const result = await engine.maskSSN("1234");
      expect(result.masked).toBe("****");
      expect(result.hash).toBeDefined();
      expect(result.hash.length).toBe(64); // SHA-256 hex length
    });

    it("should throw error for invalid SSN input", async () => {
      await expect(engine.maskSSN("")).rejects.toThrow("Invalid SSN input");
      await expect(engine.maskSSN(null as any)).rejects.toThrow(
        "Invalid SSN input",
      );
      await expect(engine.maskSSN(123 as any)).rejects.toThrow(
        "Invalid SSN input",
      );
      await expect(engine.maskSSN("12345")).rejects.toThrow(
        "SSN must be exactly 4 digits",
      );
    });
  });

  describe("DOB Masking", () => {
    it("should mask DOB as ****-**-**", async () => {
      const result = await engine.maskDOB("1985-03-15");
      expect(result.masked).toBe("****-**-**");
      expect(result.hash).toBeDefined();
      expect(result.hash.length).toBe(64); // SHA-256 hex length
    });

    it("should handle different DOB formats", async () => {
      const formats = ["1985-03-15", "03/15/1985", "March 15, 1985"];

      for (const format of formats) {
        const result = await engine.maskDOB(format);
        expect(result.masked).toBe("****-**-**");
        expect(result.hash).toBeDefined();
      }
    });

    it("should throw error for invalid DOB input", async () => {
      await expect(engine.maskDOB("")).rejects.toThrow("Invalid DOB input");
      await expect(engine.maskDOB(null as any)).rejects.toThrow(
        "Invalid DOB input",
      );
    });
  });

  describe("Email Masking", () => {
    it("should mask email local part while preserving domain", async () => {
      const result = await engine.maskEmail("user@example.com");
      expect(result.masked).toBe("****@****.***");
      expect(result.domain).toBe("example.com");
      expect(result.hash).toBeDefined();
      expect(result.hash.length).toBe(64);
    });

    it("should handle complex email addresses", async () => {
      const result = await engine.maskEmail(
        "complex.user+tag@subdomain.example.org",
      );
      expect(result.masked).toBe("****@****.***");
      expect(result.domain).toBe("subdomain.example.org");
      expect(result.hash).toBeDefined();
    });

    it("should throw error for invalid email input", async () => {
      await expect(engine.maskEmail("invalid-email")).rejects.toThrow(
        "Invalid email input",
      );
      await expect(engine.maskEmail("")).rejects.toThrow("Invalid email input");
      await expect(engine.maskEmail(null as any)).rejects.toThrow(
        "Invalid email input",
      );
      await expect(engine.maskEmail("@example.com")).rejects.toThrow(
        "Invalid email format",
      );
    });
  });

  describe("Income Bucketing", () => {
    it("should convert income to appropriate buckets", async () => {
      const testCases = [
        { income: 20000, expected: "$0-$25K" },
        { income: 35000, expected: "$25K-$50K" },
        { income: 65000, expected: "$50K-$75K" },
        { income: 85000, expected: "$75K-$100K" },
        { income: 125000, expected: "$100K-$150K" },
        { income: 175000, expected: "$150K-$200K" },
        { income: 250000, expected: "$200K+" },
      ];

      for (const testCase of testCases) {
        const result = await engine.bucketIncome(testCase.income);
        expect(result).toBe(testCase.expected);
      }
    });

    it("should handle edge cases for income bucketing", async () => {
      expect(await engine.bucketIncome(0)).toBe("$0-$25K");
      expect(await engine.bucketIncome(25000)).toBe("$25K-$50K");
      expect(await engine.bucketIncome(50000)).toBe("$50K-$75K");
    });

    it("should throw error for invalid income input", async () => {
      await expect(engine.bucketIncome(-1000)).rejects.toThrow(
        "Invalid income input",
      );
      await expect(engine.bucketIncome(NaN)).rejects.toThrow(
        "Invalid income input",
      );
      await expect(engine.bucketIncome("50000" as any)).rejects.toThrow(
        "Invalid income input",
      );
    });
  });

  describe("Fail-Closed Behavior", () => {
    it("should return [REDACTED] on pseudonymization failure", () => {
      const result = engine.handleFailure("sensitive_field");
      expect(result).toBe("[REDACTED]");
    });

    it("should handle failures gracefully in payload pseudonymization", async () => {
      // Create a failing engine that throws an error for SSN masking
      const failingEngine = new TestPseudonymizationEngine();
      jest
        .spyOn(failingEngine, "maskSSN")
        .mockRejectedValue(new Error("Crypto failure"));

      const payload = { ssn: "1234", name: "John Doe" };

      // The implementation should catch the error and use handleFailure
      const result = await failingEngine.pseudonymizePayload(payload);
      expect(result.ssn).toBe("[REDACTED]");
      expect(result.ssn_hash).toBeUndefined();
      expect(result.name).toBe("John Doe"); // Non-PII field should remain unchanged
    });
  });

  describe("Salt Rotation", () => {
    it("should rotate salts and enable dual-read compatibility", async () => {
      const originalSalt = engine.getCurrentSalt();

      await engine.rotateSalts();

      const newSalt = engine.getCurrentSalt();
      const previousSalt = engine.getPreviousSalt();

      expect(newSalt).not.toBe(originalSalt);
      expect(previousSalt).toBe(originalSalt);
      expect(engine.isDualReadActive()).toBe(true);
    });

    it("should maintain dual-read compatibility during transition", async () => {
      const input = "1234";
      const resultBeforeRotation = await engine.maskSSN(input);

      await engine.rotateSalts();

      // During dual-read period, both old and new hashes should be valid
      expect(engine.isDualReadActive()).toBe(true);

      const resultAfterRotation = await engine.maskSSN(input);
      expect(resultAfterRotation.hash).not.toBe(resultBeforeRotation.hash);
    });
  });

  describe("User Pseudonym Generation", () => {
    it("should generate deterministic pseudonyms for user IDs", async () => {
      const userId = "user123";
      const pseudonym1 = await engine.generateUserPseudonym(userId);
      const pseudonym2 = await engine.generateUserPseudonym(userId);

      expect(pseudonym1).toBe(pseudonym2);
      expect(pseudonym1).toMatch(/^user_[a-f0-9]{16}$/);
    });

    it("should generate different pseudonyms for different users", async () => {
      const pseudonym1 = await engine.generateUserPseudonym("user123");
      const pseudonym2 = await engine.generateUserPseudonym("user456");

      expect(pseudonym1).not.toBe(pseudonym2);
    });
  });

  describe("Payload Pseudonymization", () => {
    it("should pseudonymize all PII fields in payload", async () => {
      const payload = {
        ssn: "1234",
        dob: "1985-03-15",
        email: "user@example.com",
        income: 65000,
        name: "John Doe", // Non-PII field should remain unchanged
        session_id: "session123",
      };

      const result = await engine.pseudonymizePayload(payload);

      expect(result.ssn).toBe("****");
      expect(result.ssn_hash).toBeDefined();
      expect(result.dob).toBe("****-**-**");
      expect(result.dob_hash).toBeDefined();
      expect(result.email).toBe("****@****.***");
      expect(result.email_hash).toBeDefined();
      expect(result.email_domain).toBe("example.com");
      expect(result.income).toBe("$50K-$75K");
      expect(result.name).toBe("John Doe"); // Unchanged
      expect(result.session_id).toBe("session123"); // Unchanged
    });

    it("should handle payload with no PII fields", async () => {
      const payload = {
        session_id: "session123",
        timestamp: "2024-01-01T00:00:00Z",
        event_type: "node_entered",
      };

      const result = await engine.pseudonymizePayload(payload);
      expect(result).toEqual(payload);
    });

    it("should handle empty payload", async () => {
      const payload = {};
      const result = await engine.pseudonymizePayload(payload);
      expect(result).toEqual({});
    });
  });
});
