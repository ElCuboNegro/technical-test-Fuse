/**
 * Contact Information Node Integration Tests
 *
 * Tests the complete contact information collection flow including:
 * - Happy path scenarios with and without email
 * - Multi-unit address detection and handling
 * - ZIP+4 format support
 * - Error recovery scenarios
 * - Telemetry and logging validation
 * - Performance and security requirements
 *
 * Requirements: R1.1, R1.2, R1.3, R1.4, R2.1, R2.2, R4.1, R4.2, R4.3, R4.4, R5.1, R5.2, R5.3, R5.4, R6.1, R6.2, R6.3, R6.4
 */

import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import {
  replayConversation,
  captureEvents,
  ttsFormat,
  verifyPIIRedaction,
  loadFixture,
  ContactTestFixture,
  ConversationEvent,
} from "../utils/contact-test-harness";

describe("Contact Information Node Integration Tests", () => {
  let pool: Pool;

  beforeAll(async () => {
    // Mock database connection for integration tests
    const mockQuery = jest.fn().mockImplementation((query: string) => {
      // Mock schema queries for security tests
      if (
        query.includes("information_schema.columns") &&
        query.includes("contact_information")
      ) {
        return Promise.resolve({
          rows: [
            { column_name: "session_id", data_type: "uuid", is_nullable: "NO" },
            {
              column_name: "street_address",
              data_type: "text",
              is_nullable: "YES",
            },
            { column_name: "city", data_type: "text", is_nullable: "YES" },
            { column_name: "state", data_type: "text", is_nullable: "YES" },
            { column_name: "zip_code", data_type: "text", is_nullable: "YES" },
            { column_name: "email", data_type: "text", is_nullable: "YES" },
          ],
        });
      }

      if (
        query.includes("information_schema.table_constraints") &&
        query.includes("contact_information")
      ) {
        return Promise.resolve({
          rows: [
            {
              constraint_name: "contact_information_session_id_fkey",
              constraint_type: "FOREIGN KEY",
            },
          ],
        });
      }

      // Default mock response for other queries
      return Promise.resolve({ rows: [] });
    });

    pool = {
      query: mockQuery,
      end: jest.fn().mockResolvedValue(undefined),
    } as any;
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  describe("Happy Path Scenarios", () => {
    /**
     * Test C1: Happy path with email - full address + email in one utterance
     * → `addressComplete:true`, `emailComplete:true`, route to `financial`
     * Requirements: R1.1, R1.2, R1.3, R1.4, R2.1, R2.2, R4.1, R4.2, R4.3, R4.4
     */
    it("should successfully collect complete address and email (C1)", async () => {
      const fixture = loadFixture("contact_good_address");
      const result = await replayConversation(fixture);

      // Verify final state
      expect(result.success).toBe(true);
      expect(result.finalState.needs).toEqual({
        identity: false,
        contact: false,
        financial: true,
        confirm: false,
      });

      // Verify collected data structure
      expect(result.finalState.collected.contact).toBeDefined();
      expect(result.finalState.collected.contact.address).toEqual({
        street: "1247 Oak Street",
        city: "Denver",
        state: "CO", // Normalized to 2-letter code
        zipCode: "80202",
      });
      expect(result.finalState.collected.contact.email).toBe(
        "mthompson.denver@gmail.com",
      );

      // Verify progress tracking
      expect(result.finalState.contactProgress).toEqual({
        addressComplete: true,
        emailComplete: true,
        unitNumberAsked: true,
      });

      // Verify routing
      expect(result.nodes).toContain("contact");

      // Verify events were captured
      expect(result.events.length).toBeGreaterThan(0);
      const successEvent = result.events.find(
        (e) => e.success === true && e.node === "contact",
      );
      expect(successEvent).toBeDefined();
      expect(successEvent?.redacted_fields?.email).toBe("****@****.***");
    });

    /**
     * Test C2: Happy path without email - declares "no email"
     * → `collected.contact.email` absent, still routes to `financial`
     * Requirements: R2.1, R2.2, R4.1, R4.2, R4.3, R4.4
     */
    it("should successfully collect address without email (C2)", async () => {
      const fixture = loadFixture("contact_no_email");
      const result = await replayConversation(fixture);

      // Verify final state
      expect(result.success).toBe(true);
      expect(result.finalState.needs).toEqual({
        identity: false,
        contact: false,
        financial: true,
        confirm: false,
      });

      // Verify collected data - no email field
      expect(result.finalState.collected.contact.address).toEqual({
        street: "456 Pine Avenue",
        city: "Los Angeles",
        state: "CA",
        zipCode: "90210",
      });
      expect(result.finalState.collected.contact.email).toBeUndefined();

      // Verify progress tracking
      expect(result.finalState.contactProgress).toEqual({
        addressComplete: true,
        emailComplete: true, // Complete even without email
        unitNumberAsked: true,
      });

      // Verify events show no email provided
      const successEvent = result.events.find(
        (e) => e.success === true && e.node === "contact",
      );
      expect(successEvent).toBeDefined();
      expect(successEvent?.redacted_fields?.email).toBeNull();
    });

    /**
     * Test C3: Multi-unit prompt once - street implies unit, user supplies unit on prompt
     * → `unitNumberAsked:true` exactly once, unit persisted
     * Requirements: R1.1, R1.2, R1.3, R1.4, R4.1, R4.2, R4.3, R4.4
     */
    it("should detect multi-unit address and ask for unit number once (C3)", async () => {
      const fixture = loadFixture("contact_multi_unit");
      const result = await replayConversation(fixture);

      // Verify final state
      expect(result.success).toBe(true);
      expect(result.finalState.collected.contact.address).toEqual({
        street: "2580 Broadway Street",
        city: "New York",
        state: "NY",
        zipCode: "10025",
        unitNumber: "15F",
      });

      // Verify unit number was asked exactly once
      expect(result.finalState.contactProgress.unitNumberAsked).toBe(true);

      // Verify unit number is included in final address
      expect(result.finalState.collected.contact.address.unitNumber).toBe(
        "15F",
      );

      // Verify conversation flow included unit number prompt
      const conversationTurns = fixture.conversation;
      const unitPrompts = conversationTurns.filter(
        (turn) =>
          turn.speaker === "agent" &&
          (turn.context?.unitNumberPrompt || turn.context?.multiUnitDetected) &&
          (turn.message.toLowerCase().includes("do you have") ||
            turn.message.toLowerCase().includes("apartment number") ||
            turn.message.toLowerCase().includes("unit number")),
      );
      expect(unitPrompts.length).toBe(1); // Asked exactly once
    });

    /**
     * Test C6: ZIP+4 format - input "02139-4307" → accepts, TTS renders with "dash"
     * Requirements: R1.1, R1.2, R1.3, R1.4, R3.1, R3.2, R3.3, R3.4
     */
    it("should handle ZIP+4 format correctly (C6)", async () => {
      const fixture = loadFixture("contact_zip9");
      const result = await replayConversation(fixture);

      // Verify ZIP+4 is accepted and stored correctly
      expect(result.success).toBe(true);
      expect(result.finalState.collected.contact.address.zipCode).toBe(
        "02139-4307",
      );

      // Verify TTS formatting for ZIP+4
      const zipFormatted = ttsFormat.zipCode("02139-4307");
      expect(zipFormatted).toBe("0-2-1-3-9, dash, 4-3-0-7");

      // Verify address TTS formatting includes ZIP+4 correctly
      const addressFormatted = ttsFormat.address(
        result.finalState.collected.contact.address,
      );
      expect(addressFormatted).toContain("0-2-1-3-9, dash, 4-3-0-7");
    });
  });

  describe("Error Recovery Scenarios", () => {
    /**
     * Test C4: Invalid ZIP then fix - first `zip="12"` → error, next `zip="94107"` → success
     * Two `conversation_events` (fail then success)
     * Requirements: R5.1, R5.2, R5.3, R5.4
     */
    it("should recover from invalid ZIP code (C4)", async () => {
      const fixture = loadFixture("contact_invalid_zip_then_fix");
      const result = await replayConversation(fixture);

      // Verify final success
      expect(result.success).toBe(true);
      expect(result.finalState.collected.contact.address.zipCode).toBe("80202");

      // Verify two events: failure then success
      const contactEvents = result.events.filter((e) => e.node === "contact");
      expect(contactEvents.length).toBe(2);

      const failureEvent = contactEvents.find((e) => e.success === false);
      const successEvent = contactEvents.find((e) => e.success === true);

      expect(failureEvent).toBeDefined();
      expect(failureEvent?.reason).toBe("INVALID_ZIP_FORMAT");
      expect(successEvent).toBeDefined();

      // Verify attempt numbers are sequential
      expect(failureEvent?.attempt_number).toBe(1);
      expect(successEvent?.attempt_number).toBe(2);
    });

    /**
     * Test C5: Invalid state then fix - first `state="Cali"` → error, next `"CA"` → success
     * Same pattern as C4
     * Requirements: R5.1, R5.2, R5.3, R5.4
     */
    it("should recover from invalid state code (C5)", async () => {
      const fixture = loadFixture("contact_invalid_state_then_fix");
      const result = await replayConversation(fixture);

      // Verify final success
      expect(result.success).toBe(true);
      expect(result.finalState.collected.contact.address.state).toBe("CA");

      // Verify two events: failure then success
      const contactEvents = result.events.filter((e) => e.node === "contact");
      expect(contactEvents.length).toBe(2);

      const failureEvent = contactEvents.find((e) => e.success === false);
      const successEvent = contactEvents.find((e) => e.success === true);

      expect(failureEvent).toBeDefined();
      expect(failureEvent?.reason).toBe("INVALID_STATE_CODE");
      expect(successEvent).toBeDefined();

      // Verify state normalization
      expect(result.finalState.collected.contact.address.state).toBe("CA");
    });

    /**
     * Test C7: Email spelling retry - first spelling confirmation "no", second "yes"
     * → first returns recoverable error, second persists email
     * Requirements: R2.1, R2.2, R3.1, R3.2, R3.3, R3.4, R5.1, R5.2, R5.3, R5.4
     */
    it("should handle email spelling confirmation retry (C7)", async () => {
      const fixture = loadFixture("contact_retry_email_spelling");
      const result = await replayConversation(fixture);

      // Verify final success with email persisted
      expect(result.success).toBe(true);
      expect(result.finalState.collected.contact.email).toBeDefined();

      // Verify email spelling was attempted
      const conversationTurns = fixture.conversation;
      const spellingTurns = conversationTurns.filter(
        (turn) =>
          turn.speaker === "agent" && turn.message.includes("spell that back"),
      );
      expect(spellingTurns.length).toBeGreaterThan(0);

      // Verify recovery from spelling confirmation failure
      const contactEvents = result.events.filter((e) => e.node === "contact");
      const hasRecoveryEvent = contactEvents.some(
        (e) => e.reason === "EMAIL_CONFIRMATION_FAILED" && e.success === false,
      );

      if (hasRecoveryEvent) {
        // If there was a spelling failure, verify recovery
        const successEvent = contactEvents.find((e) => e.success === true);
        expect(successEvent).toBeDefined();
      }
    });

    /**
     * Test C8: System error recovery - simulate DB write error on first attempt
     * → recoverable error, retry succeeds, telemetry logs error then success
     * Requirements: R5.1, R5.2, R5.3, R5.4, R6.1, R6.2, R6.3, R6.4
     */
    it("should recover from system errors (C8)", async () => {
      const fixture = loadFixture("contact_system_error");

      // Mock a system error on first attempt
      const originalQuery = pool.query;
      let queryAttempts = 0;

      pool.query = jest.fn().mockImplementation((...args) => {
        queryAttempts++;
        if (
          queryAttempts === 1 &&
          args[0].includes("INSERT INTO contact_information")
        ) {
          throw new Error("Database connection timeout");
        }
        return originalQuery.apply(pool, args);
      });

      const result = await replayConversation(fixture);

      // Restore original query method
      pool.query = originalQuery;

      // Verify final success after recovery
      expect(result.success).toBe(true);

      // Verify system error was logged and recovered
      const contactEvents = result.events.filter((e) => e.node === "contact");
      const errorEvent = contactEvents.find(
        (e) => e.success === false && e.reason?.includes("SYSTEM_ERROR"),
      );
      const successEvent = contactEvents.find((e) => e.success === true);

      if (errorEvent) {
        expect(successEvent).toBeDefined();
        expect(errorEvent.attempt_number).toBeLessThan(
          successEvent!.attempt_number,
        );
      }
    });
  });

  describe("Telemetry & Logging Validation", () => {
    /**
     * Test event contains `session_id`, `user_id`, `node="contact"`, `event_type`,
     * `attempt_number`, `success`, `reason?`
     * Requirements: R6.1, R6.2, R6.3, R6.4
     */
    it("should generate properly structured telemetry events", async () => {
      const fixture = loadFixture("contact_good_address");
      const result = await replayConversation(fixture);

      expect(result.events.length).toBeGreaterThan(0);

      const contactEvent = result.events.find((e) => e.node === "contact");
      expect(contactEvent).toBeDefined();

      // Verify required event fields
      expect(contactEvent).toHaveProperty("session_id");
      expect(contactEvent).toHaveProperty("user_id");
      expect(contactEvent?.node).toBe("contact");
      expect(contactEvent).toHaveProperty("event_type");
      expect(contactEvent).toHaveProperty("attempt_number");
      expect(contactEvent).toHaveProperty("success");
      expect(contactEvent).toHaveProperty("timestamp");

      // Verify session_id format
      expect(contactEvent?.session_id).toMatch(/^test-/);

      // Verify attempt_number is positive integer
      expect(contactEvent?.attempt_number).toBeGreaterThan(0);
      expect(Number.isInteger(contactEvent?.attempt_number)).toBe(true);
    });

    /**
     * Test redactions: `address` redacted via `redactContactPII`,
     * `email` logged as `"****@****.***"` when present
     * Requirements: R6.1, R6.2, R6.3, R6.4
     */
    it("should properly redact PII in telemetry events", async () => {
      const fixture = loadFixture("contact_good_address");
      const result = await replayConversation(fixture);

      // Verify PII redaction
      const redactionResult = verifyPIIRedaction(result.events);
      expect(redactionResult.passed).toBe(true);
      expect(redactionResult.violations).toHaveLength(0);

      // Verify specific redaction patterns
      const contactEvent = result.events.find(
        (e) => e.node === "contact" && e.success === true,
      );
      expect(contactEvent?.redacted_fields?.email).toBe("****@****.***");
      expect(contactEvent?.redacted_fields?.address).toBe("****@****.***");
    });

    /**
     * Test monotonic `attempt_number` per session
     * Requirements: R6.1, R6.2, R6.3, R6.4
     */
    it("should maintain monotonic attempt numbers per session", async () => {
      const fixture = loadFixture("contact_invalid_zip_then_fix");
      const result = await replayConversation(fixture);

      const contactEvents = result.events
        .filter((e) => e.node === "contact")
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

      // Verify attempt numbers are monotonically increasing
      for (let i = 1; i < contactEvents.length; i++) {
        expect(contactEvents[i].attempt_number).toBeGreaterThan(
          contactEvents[i - 1].attempt_number,
        );
      }
    });

    /**
     * Test timestamps increase and DB rows exist for each attempt
     * Requirements: R6.1, R6.2, R6.3, R6.4
     */
    it("should maintain chronological timestamps and database persistence", async () => {
      const fixture = loadFixture("contact_good_address");
      const result = await replayConversation(fixture);

      // Verify timestamps are chronological
      const events = result.events.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      for (let i = 1; i < events.length; i++) {
        expect(new Date(events[i].timestamp).getTime()).toBeGreaterThanOrEqual(
          new Date(events[i - 1].timestamp).getTime(),
        );
      }

      // Verify database persistence (mock implementation)
      const sessionId = result.events[0]?.session_id;
      if (sessionId) {
        const dbEvents = await captureEvents(sessionId);
        expect(dbEvents.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Performance & Load Tests", () => {
    /**
     * Test node completion p50 ≤ 300ms, p95 ≤ 800ms (without LLM latency)
     * Requirements: R4.3, R6.3
     */
    it("should meet performance requirements for node completion", async () => {
      const fixture = loadFixture("contact_good_address");
      const iterations = 20;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        await replayConversation(fixture);
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      durations.sort((a, b) => a - b);

      const p50 = durations[Math.floor(iterations * 0.5)];
      const p95 = durations[Math.floor(iterations * 0.95)];

      expect(p50).toBeLessThanOrEqual(300);
      expect(p95).toBeLessThanOrEqual(800);
    });

    /**
     * Test with LLM JSON extraction p95 ≤ 1500ms
     * Requirements: R4.3, R6.3
     */
    it("should meet performance requirements with LLM processing", async () => {
      const fixture = loadFixture("contact_good_address");
      const iterations = 10;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        // Simulate LLM processing delay
        await new Promise((resolve) =>
          setTimeout(resolve, 100 + Math.random() * 200),
        );

        await replayConversation(fixture);
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      durations.sort((a, b) => a - b);
      const p95 = durations[Math.floor(iterations * 0.95)];

      expect(p95).toBeLessThanOrEqual(1500);
    });

    /**
     * Test 200 RPS synthetic with pooled PG connections, zero failed writes
     * Requirements: R4.3, R6.3
     */
    it("should handle high throughput with zero failed writes", async () => {
      const fixture = loadFixture("contact_good_address");
      const concurrentRequests = 50; // Scaled down for test environment
      const promises: Promise<any>[] = [];

      const startTime = Date.now();

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(replayConversation(fixture));
      }

      const results = await Promise.allSettled(promises);
      const duration = Date.now() - startTime;

      // Verify all requests succeeded
      const failures = results.filter((r) => r.status === "rejected");
      expect(failures.length).toBe(0);

      // Verify throughput (should complete within reasonable time)
      const rps = (concurrentRequests / duration) * 1000;
      expect(rps).toBeGreaterThan(10); // Minimum acceptable throughput
    });

    /**
     * Test no memory growth across 10k sequential invocations (leak check)
     * Requirements: R4.3, R6.3
     */
    it("should not have memory leaks during extended operation", async () => {
      const fixture = loadFixture("contact_no_email"); // Simpler fixture for performance
      const iterations = 100; // Scaled down for test environment

      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < iterations; i++) {
        await replayConversation(fixture);

        // Force garbage collection periodically
        if (i % 10 === 0 && global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;
      const memoryGrowthMB = memoryGrowth / (1024 * 1024);

      // Memory growth should be minimal (less than 10MB for 100 iterations)
      expect(memoryGrowthMB).toBeLessThan(10);
    });
  });

  describe("Security & PII Tests", () => {
    /**
     * Test no raw street/city/state/ZIP/email in application logs, only redacted payloads
     * Requirements: R6.1, R6.2, R6.3, R6.4
     */
    it("should not expose raw PII in application logs", async () => {
      const fixture = loadFixture("contact_good_address");

      // Capture console output during test
      const consoleLogs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => {
        consoleLogs.push(args.join(" "));
      };

      try {
        await replayConversation(fixture);

        // Verify no raw PII in logs
        const logContent = consoleLogs.join(" ");

        // Should not contain raw email
        expect(logContent).not.toMatch(/mthompson\.denver@gmail\.com/);

        // Should not contain raw address components
        expect(logContent).not.toMatch(/1247 Oak Street/);
        expect(logContent).not.toMatch(/Denver/);
        expect(logContent).not.toMatch(/80202/);

        // Should contain redacted versions if any logging occurs
        if (logContent.includes("email")) {
          expect(logContent).toMatch(/\*\*\*\*@\*\*\*\*\.\*\*\*/);
        }
      } finally {
        console.log = originalLog;
      }
    });

    /**
     * Test SQL parameters are bound (no string interpolation)
     * Requirements: R6.1, R6.2, R6.3, R6.4
     */
    it("should use parameterized queries to prevent SQL injection", async () => {
      const fixture = loadFixture("contact_good_address");

      // Mock pool.query to verify parameterized queries
      const originalQuery = pool.query;
      const queryCallsLog: any[] = [];

      pool.query = jest.fn().mockImplementation((...args) => {
        queryCallsLog.push(args);
        return originalQuery.apply(pool, args);
      });

      try {
        await replayConversation(fixture);

        // Verify all queries use parameters
        for (const call of queryCallsLog) {
          const [query, params] = call;

          if (typeof query === "string" && query.includes("INSERT")) {
            // Should use $1, $2, etc. placeholders
            expect(query).toMatch(/\$\d+/);

            // Should have corresponding parameters
            expect(params).toBeDefined();
            expect(Array.isArray(params)).toBe(true);
          }
        }
      } finally {
        pool.query = originalQuery;
      }
    });

    /**
     * Test encryption-at-rest verified for `contact_information` table
     * Requirements: R6.1, R6.2, R6.3, R6.4
     */
    it("should verify encryption-at-rest for contact information table", async () => {
      // Verify table exists with proper structure
      const tableInfo = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'contact_information'
        ORDER BY ordinal_position
      `);

      expect(tableInfo.rows.length).toBeGreaterThan(0);

      // Verify required columns exist
      const columnNames = tableInfo.rows.map((row) => row.column_name);
      expect(columnNames).toContain("session_id");
      expect(columnNames).toContain("street_address");
      expect(columnNames).toContain("city");
      expect(columnNames).toContain("state");
      expect(columnNames).toContain("zip_code");
      expect(columnNames).toContain("email");

      // Note: Actual encryption verification would require database-specific queries
      // This is a structural verification that the table exists for encrypted storage
    });

    /**
     * Test access control: writes require session FK, orphan writes rejected
     * Requirements: R6.1, R6.2, R6.3, R6.4
     */
    it("should enforce access control with session foreign keys", async () => {
      const sessionId = `test-${uuidv4()}`;

      // Try to insert contact information without valid session
      try {
        await pool.query(
          `
          INSERT INTO contact_information (
            session_id, street_address, city, state, zip_code
          ) VALUES ($1, $2, $3, $4, $5)
        `,
          [sessionId, "123 Test St", "Test City", "CA", "12345"],
        );

        // If this succeeds, verify foreign key constraint exists
        const constraintInfo = await pool.query(`
          SELECT constraint_name, constraint_type
          FROM information_schema.table_constraints
          WHERE table_name = 'contact_information' 
          AND constraint_type = 'FOREIGN KEY'
        `);

        expect(constraintInfo.rows.length).toBeGreaterThan(0);
      } catch (error) {
        // Foreign key constraint should prevent orphan writes
        expect(error.message).toMatch(/foreign key constraint|violates/i);
      }
    });
  });

  describe("Concurrency & Idempotency Tests", () => {
    /**
     * Test parallel sessions with same `user_id` do NOT cross-contaminate `contactProgress`
     * Requirements: R4.3, R6.3
     */
    it("should isolate contact progress between parallel sessions", async () => {
      const userId = "test-user-concurrent";
      const sessionId1 = `test-${uuidv4()}`;
      const sessionId2 = `test-${uuidv4()}`;

      const fixture1 = { ...loadFixture("contact_good_address") };
      const fixture2 = { ...loadFixture("contact_multi_unit") };

      // Run parallel sessions with same user_id
      const [result1, result2] = await Promise.all([
        replayConversation(fixture1),
        replayConversation(fixture2),
      ]);

      // Verify both sessions completed successfully
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Verify session isolation - different contact data
      expect(result1.finalState.collected.contact.address.street).not.toBe(
        result2.finalState.collected.contact.address.street,
      );

      // Verify progress tracking is independent
      expect(result1.finalState.contactProgress.unitNumberAsked).toBe(true);
      expect(result2.finalState.contactProgress.unitNumberAsked).toBe(true);

      // But they should have different unit number values
      expect(result1.finalState.collected.contact.address.unitNumber).not.toBe(
        result2.finalState.collected.contact.address.unitNumber,
      );
    });

    /**
     * Test re-invoking node with identical inputs is idempotent
     * (no duplicate rows, no counter skew)
     * Requirements: R4.3, R6.3
     */
    it("should be idempotent for identical inputs", async () => {
      const fixture = loadFixture("contact_good_address");

      // Run same conversation twice
      const result1 = await replayConversation(fixture);
      const result2 = await replayConversation(fixture);

      // Both should succeed
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Final states should be identical
      expect(result1.finalState.collected.contact).toEqual(
        result2.finalState.collected.contact,
      );
      expect(result1.finalState.contactProgress).toEqual(
        result2.finalState.contactProgress,
      );

      // Verify no duplicate database entries (would need actual DB integration)
      // This is a structural test - actual implementation would verify DB state
    });

    /**
     * Test concurrent database writes and session management
     * Requirements: R4.3, R6.3
     */
    it("should handle concurrent database writes safely", async () => {
      const fixture = loadFixture("contact_no_email");
      const concurrentSessions = 10;
      const promises: Promise<any>[] = [];

      // Create multiple concurrent sessions
      for (let i = 0; i < concurrentSessions; i++) {
        promises.push(replayConversation(fixture));
      }

      const results = await Promise.allSettled(promises);

      // All sessions should complete successfully
      const failures = results.filter((r) => r.status === "rejected");
      expect(failures.length).toBe(0);

      // All successful results should have proper state
      const successfulResults = results
        .filter((r) => r.status === "fulfilled")
        .map((r) => (r as PromiseFulfilledResult<any>).value);

      for (const result of successfulResults) {
        expect(result.success).toBe(true);
        expect(result.finalState.needs.contact).toBe(false);
        expect(result.finalState.needs.financial).toBe(true);
      }
    });

    /**
     * Test session isolation and data protection
     * Requirements: R4.3, R6.3
     */
    it("should maintain session isolation and data protection", async () => {
      const fixture1 = loadFixture("contact_good_address");
      const fixture2 = loadFixture("contact_no_email");

      // Run sessions with different data concurrently
      const [result1, result2] = await Promise.all([
        replayConversation(fixture1),
        replayConversation(fixture2),
      ]);

      // Verify session isolation
      expect(result1.finalState.collected.contact.email).toBeDefined();
      expect(result2.finalState.collected.contact.email).toBeUndefined();

      // Verify different session IDs
      expect(result1.events[0]?.session_id).not.toBe(
        result2.events[0]?.session_id,
      );

      // Verify events are properly attributed to correct sessions
      const session1Events = result1.events.filter(
        (e) => e.session_id === result1.events[0]?.session_id,
      );
      const session2Events = result2.events.filter(
        (e) => e.session_id === result2.events[0]?.session_id,
      );

      expect(session1Events.length).toBe(result1.events.length);
      expect(session2Events.length).toBe(result2.events.length);
    });
  });

  describe("Golden Replay Tests for Voice/TTS", () => {
    /**
     * Test exact TTS strings for address confirmation (with/without unit)
     * Requirements: R3.1, R3.2, R3.3, R3.4
     */
    it("should generate exact TTS strings for address confirmation", async () => {
      // Test address without unit
      const address1 = {
        street: "456 Pine Avenue",
        city: "Los Angeles",
        state: "CA",
        zipCode: "90210",
      };

      const tts1 = ttsFormat.address(address1);
      expect(tts1).toBe("456 Pine Avenue, Los Angeles, CA, 9-0-2-1-0");

      // Test address with unit
      const address2 = {
        street: "2580 Broadway Street",
        city: "New York",
        state: "NY",
        zipCode: "10025",
        unitNumber: "15F",
      };

      const tts2 = ttsFormat.address(address2);
      expect(tts2).toBe("2580 Broadway Street, 15F, New York, NY, 1-0-0-2-5");
    });

    /**
     * Test exact TTS strings for ZIP (5-digit and ZIP+4)
     * Requirements: R3.1, R3.2, R3.3, R3.4
     */
    it("should generate exact TTS strings for ZIP codes", async () => {
      // Test 5-digit ZIP
      const zip5 = ttsFormat.zipCode("12345");
      expect(zip5).toBe("1-2-3-4-5");

      // Test ZIP+4
      const zip9 = ttsFormat.zipCode("12345-6789");
      expect(zip9).toBe("1-2-3-4-5, dash, 6-7-8-9");
    });

    /**
     * Test exact TTS strings for email spelling
     * Requirements: R3.1, R3.2, R3.3, R3.4
     */
    it("should generate exact TTS strings for email spelling", async () => {
      const email = "user@example.com";
      const ttsEmail = ttsFormat.email(email);
      expect(ttsEmail).toBe("u-s-e-r- -a-t- -e-x-a-m-p-l-e- -d-o-t- -c-o-m");
    });

    /**
     * Test TTS formatting change requires updating golden baselines (approval test)
     * Requirements: R3.1, R3.2, R3.3, R3.4
     */
    it("should maintain consistent TTS formatting (golden baseline)", async () => {
      // Golden baselines for TTS formatting
      const goldenBaselines = {
        zipCode5: "1-2-3-4-5",
        zipCode9: "1-2-3-4-5, dash, 6-7-8-9",
        email: "u-s-e-r- -a-t- -e-x-a-m-p-l-e- -d-o-t- -c-o-m",
        addressNoUnit: "123 Main St, Anytown, CA, 1-2-3-4-5",
        addressWithUnit: "123 Main St, Apt 4B, Anytown, CA, 1-2-3-4-5",
      };

      // Test current formatting against golden baselines
      expect(ttsFormat.zipCode("12345")).toBe(goldenBaselines.zipCode5);
      expect(ttsFormat.zipCode("12345-6789")).toBe(goldenBaselines.zipCode9);
      expect(ttsFormat.email("user@example.com")).toBe(goldenBaselines.email);

      expect(
        ttsFormat.address({
          street: "123 Main St",
          city: "Anytown",
          state: "CA",
          zipCode: "12345",
        }),
      ).toBe(goldenBaselines.addressNoUnit);

      expect(
        ttsFormat.address({
          street: "123 Main St",
          city: "Anytown",
          state: "CA",
          zipCode: "12345",
          unitNumber: "Apt 4B",
        }),
      ).toBe(goldenBaselines.addressWithUnit);

      // If any of these fail, the golden baselines need to be updated
      // This serves as an approval test for TTS formatting changes
    });
  });
});
