import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";

describe("Database Enforcement Integration Tests", () => {
  let pool: Pool;

  beforeAll(async () => {
    // Initialize database connection
    pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ||
        "postgresql://postgres:postgres@localhost:5432/voice_verification_test",
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Ensure database is ready
    await pool.query("SELECT 1");
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up test data before each test (except audit_events which are immutable)
    await pool.query(
      "DELETE FROM conversation_events WHERE session_id LIKE $1",
      ["test-%"],
    );
    await pool.query("DELETE FROM graph_nodes WHERE session_id LIKE $1", [
      "test-%",
    ]);
    await pool.query("DELETE FROM graph_edges WHERE session_id LIKE $1", [
      "test-%",
    ]);
    await pool.query(
      "DELETE FROM pseudonym_cache WHERE original_hash LIKE $1",
      ["test-%"],
    );

    // For audit_events, we can't delete them due to immutability triggers
    // Instead, we'll use unique session IDs for each test to avoid conflicts
  });

  describe("PII Detection Triggers", () => {
    it("should block raw SSN patterns in conversation_events payload", async () => {
      const sessionId = `test-${uuidv4()}`;
      const threadId = `thread-${uuidv4()}`;

      // Test various SSN formats
      const ssnPatterns = [
        "123-45-6789",
        "123456789",
        "1234", // Last 4 digits
      ];

      for (const ssn of ssnPatterns) {
        const payload = { ssn: ssn, message: "test data" };

        await expect(
          pool.query(
            `INSERT INTO conversation_events (session_id, thread_id, node, event_type, payload) 
             VALUES ($1, $2, $3, $4, $5)`,
            [
              sessionId,
              threadId,
              "identity",
              "message_user",
              JSON.stringify(payload),
            ],
          ),
        ).rejects.toThrow(/Raw PII patterns detected/);
      }
    });

    it("should block raw DOB patterns in conversation_events payload", async () => {
      const sessionId = `test-${uuidv4()}`;
      const threadId = `thread-${uuidv4()}`;

      // Test various DOB formats
      const dobPatterns = ["03/15/1985", "3-15-1985", "1985-03-15", "03/15/85"];

      for (const dob of dobPatterns) {
        const payload = { dob: dob, message: "test data" };

        await expect(
          pool.query(
            `INSERT INTO conversation_events (session_id, thread_id, node, event_type, payload) 
             VALUES ($1, $2, $3, $4, $5)`,
            [
              sessionId,
              threadId,
              "identity",
              "message_user",
              JSON.stringify(payload),
            ],
          ),
        ).rejects.toThrow(/Raw PII patterns detected/);
      }
    });

    it("should block raw email patterns in conversation_events payload", async () => {
      const sessionId = `test-${uuidv4()}`;
      const threadId = `thread-${uuidv4()}`;

      const emailPatterns = [
        "user@example.com",
        "test.email+tag@domain.co.uk",
        "simple@test.org",
      ];

      for (const email of emailPatterns) {
        const payload = { email: email, message: "test data" };

        await expect(
          pool.query(
            `INSERT INTO conversation_events (session_id, thread_id, node, event_type, payload) 
             VALUES ($1, $2, $3, $4, $5)`,
            [
              sessionId,
              threadId,
              "contact",
              "message_user",
              JSON.stringify(payload),
            ],
          ),
        ).rejects.toThrow(/Raw PII patterns detected/);
      }
    });

    it("should block raw address patterns in conversation_events payload", async () => {
      const sessionId = `test-${uuidv4()}`;
      const threadId = `thread-${uuidv4()}`;

      const addressPatterns = [
        "123 Main Street",
        "456 Oak Ave Apt 2B",
        "789 First St Unit 10",
      ];

      for (const address of addressPatterns) {
        const payload = { address: address, message: "test data" };

        await expect(
          pool.query(
            `INSERT INTO conversation_events (session_id, thread_id, node, event_type, payload) 
             VALUES ($1, $2, $3, $4, $5)`,
            [
              sessionId,
              threadId,
              "contact",
              "message_user",
              JSON.stringify(payload),
            ],
          ),
        ).rejects.toThrow(/Raw PII patterns detected/);
      }
    });

    it("should block raw income patterns in conversation_events payload", async () => {
      const sessionId = `test-${uuidv4()}`;
      const threadId = `thread-${uuidv4()}`;

      const incomePatterns = ["$50000", "$6,500.00", "75000.50"];

      for (const income of incomePatterns) {
        const payload = { income: income, message: "test data" };

        await expect(
          pool.query(
            `INSERT INTO conversation_events (session_id, thread_id, node, event_type, payload) 
             VALUES ($1, $2, $3, $4, $5)`,
            [
              sessionId,
              threadId,
              "financial",
              "message_user",
              JSON.stringify(payload),
            ],
          ),
        ).rejects.toThrow(/Raw PII patterns detected/);
      }
    });

    it("should allow pseudonymized data in conversation_events payload", async () => {
      const sessionId = `test-${uuidv4()}`;
      const threadId = `thread-${uuidv4()}`;

      // Pseudonymized data should be allowed (no raw PII patterns)
      const pseudonymizedPayload = {
        ssn_hash:
          "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
        dob_masked: "REDACTED-DATE",
        email_masked: "REDACTED-EMAIL",
        address_masked: "REDACTED-ADDRESS Denver, CO 80202",
        income_bucket: "INCOME-RANGE-3",
        message: "Identity verification completed",
      };

      await expect(
        pool.query(
          `INSERT INTO conversation_events (session_id, thread_id, node, event_type, payload) 
           VALUES ($1, $2, $3, $4, $5)`,
          [
            sessionId,
            threadId,
            "identity",
            "message_agent",
            JSON.stringify(pseudonymizedPayload),
          ],
        ),
      ).resolves.not.toThrow();

      // Verify the record was inserted
      const result = await pool.query(
        "SELECT * FROM conversation_events WHERE session_id = $1",
        [sessionId],
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].payload).toEqual(pseudonymizedPayload);
    });
  });

  describe("Audit Table Immutability", () => {
    let auditId: string;

    beforeEach(async () => {
      // Insert a test audit record
      const sessionId = `test-${uuidv4()}`;
      const result = await pool.query(
        `INSERT INTO audit_events (session_id, event_type, operation, outcome, pseudonymized_summary) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          sessionId,
          "session_started",
          "create_session",
          "success",
          JSON.stringify({ action: "session_created" }),
        ],
      );
      auditId = result.rows[0].id;
    });

    it("should reject UPDATE operations on audit_events", async () => {
      await expect(
        pool.query("UPDATE audit_events SET outcome = $1 WHERE id = $2", [
          "failure",
          auditId,
        ]),
      ).rejects.toThrow(
        /UPDATE operations are not allowed on audit_events table/,
      );
    });

    it("should reject DELETE operations on audit_events", async () => {
      await expect(
        pool.query("DELETE FROM audit_events WHERE id = $1", [auditId]),
      ).rejects.toThrow(
        /DELETE operations are not allowed on audit_events table/,
      );
    });

    it("should allow INSERT operations on audit_events", async () => {
      const sessionId = `test-${uuidv4()}`;

      await expect(
        pool.query(
          `INSERT INTO audit_events (session_id, event_type, operation, outcome, pseudonymized_summary) 
           VALUES ($1, $2, $3, $4, $5)`,
          [
            sessionId,
            "termination",
            "end_session",
            "success",
            JSON.stringify({ reason: "completed" }),
          ],
        ),
      ).resolves.not.toThrow();
    });
  });

  describe("Row-Level Security Policies", () => {
    // Note: These tests would require setting up actual database roles
    // For now, we'll test the basic structure and constraints

    it("should enforce valid event_type values in conversation_events", async () => {
      const sessionId = `test-${uuidv4()}`;
      const threadId = `thread-${uuidv4()}`;

      await expect(
        pool.query(
          `INSERT INTO conversation_events (session_id, thread_id, node, event_type, payload) 
           VALUES ($1, $2, $3, $4, $5)`,
          [
            sessionId,
            threadId,
            "test_node",
            "invalid_event_type",
            JSON.stringify({}),
          ],
        ),
      ).rejects.toThrow(/Invalid event_type/);
    });

    it("should allow valid event_type values in conversation_events", async () => {
      const sessionId = `test-${uuidv4()}`;
      const threadId = `thread-${uuidv4()}`;

      const validEventTypes = [
        "session_started",
        "message_user",
        "message_agent",
        "tool_invocation",
        "tool_result",
        "node_entered",
        "node_exited",
        "edge_transition",
        "state_snapshot_ref",
        "error",
        "termination",
      ];

      for (const eventType of validEventTypes) {
        await expect(
          pool.query(
            `INSERT INTO conversation_events (session_id, thread_id, node, event_type, payload) 
             VALUES ($1, $2, $3, $4, $5)`,
            [
              `${sessionId}-${eventType}`,
              threadId,
              "test_node",
              eventType,
              JSON.stringify({ test: true }),
            ],
          ),
        ).resolves.not.toThrow();
      }
    });

    it("should enforce required fields in conversation_events", async () => {
      const threadId = `thread-${uuidv4()}`;

      // Test missing session_id
      await expect(
        pool.query(
          `INSERT INTO conversation_events (thread_id, node, event_type, payload) 
           VALUES ($1, $2, $3, $4)`,
          [threadId, "test_node", "session_started", JSON.stringify({})],
        ),
      ).rejects.toThrow(/session_id cannot be null/);

      // Test empty session_id
      await expect(
        pool.query(
          `INSERT INTO conversation_events (session_id, thread_id, node, event_type, payload) 
           VALUES ($1, $2, $3, $4, $5)`,
          ["", threadId, "test_node", "session_started", JSON.stringify({})],
        ),
      ).rejects.toThrow(/session_id cannot be null or empty/);
    });
  });

  describe("Field-Level Encryption Functionality", () => {
    it("should validate pseudonym_cache entries", async () => {
      const originalHash = `test-${uuidv4()}`;
      const pseudonym = `pseudo-${uuidv4()}`;

      // Test successful insertion with valid data
      await expect(
        pool.query(
          `INSERT INTO pseudonym_cache (original_hash, pseudonym, data_type) 
           VALUES ($1, $2, $3)`,
          [originalHash, pseudonym, "ssn"],
        ),
      ).resolves.not.toThrow();

      // Verify the record was inserted with proper defaults
      const result = await pool.query(
        "SELECT * FROM pseudonym_cache WHERE original_hash = $1",
        [originalHash],
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].salt_version).toBe(1);
      expect(result.rows[0].expires_at).toBeDefined();
      expect(new Date(result.rows[0].expires_at)).toBeInstanceOf(Date);
    });

    it("should reject invalid data_type in pseudonym_cache", async () => {
      const originalHash = `test-${uuidv4()}`;
      const pseudonym = `pseudo-${uuidv4()}`;

      await expect(
        pool.query(
          `INSERT INTO pseudonym_cache (original_hash, pseudonym, data_type) 
           VALUES ($1, $2, $3)`,
          [originalHash, pseudonym, "invalid_type"],
        ),
      ).rejects.toThrow(/violates check constraint/);
    });

    it("should enforce unique constraints on pseudonym_cache", async () => {
      const originalHash = `test-${uuidv4()}`;
      const pseudonym = `pseudo-${uuidv4()}`;

      // Insert first record
      await pool.query(
        `INSERT INTO pseudonym_cache (original_hash, pseudonym, data_type) 
         VALUES ($1, $2, $3)`,
        [originalHash, pseudonym, "ssn"],
      );

      // Try to insert duplicate original_hash
      await expect(
        pool.query(
          `INSERT INTO pseudonym_cache (original_hash, pseudonym, data_type) 
           VALUES ($1, $2, $3)`,
          [originalHash, `different-${pseudonym}`, "dob"],
        ),
      ).rejects.toThrow(/duplicate key value violates unique constraint/);

      // Try to insert duplicate pseudonym
      await expect(
        pool.query(
          `INSERT INTO pseudonym_cache (original_hash, pseudonym, data_type) 
           VALUES ($1, $2, $3)`,
          [`different-${originalHash}`, pseudonym, "email"],
        ),
      ).rejects.toThrow(/duplicate key value violates unique constraint/);
    });

    it("should automatically set expires_at for pseudonym_cache entries", async () => {
      const originalHash = `test-${uuidv4()}`;
      const pseudonym = `pseudo-${uuidv4()}`;

      // Insert without expires_at
      await pool.query(
        `INSERT INTO pseudonym_cache (original_hash, pseudonym, data_type) 
         VALUES ($1, $2, $3)`,
        [originalHash, pseudonym, "ssn"],
      );

      const result = await pool.query(
        "SELECT expires_at FROM pseudonym_cache WHERE original_hash = $1",
        [originalHash],
      );

      const expiresAt = new Date(result.rows[0].expires_at);
      const now = new Date();

      // Check that expires_at is set to a future date (should be ~24 hours from now)
      expect(expiresAt.getTime()).toBeGreaterThan(now.getTime());

      // Check that it's within a reasonable range (23-25 hours from now)
      const hoursFromNow =
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(hoursFromNow).toBeGreaterThan(23);
      expect(hoursFromNow).toBeLessThan(25);
    });
  });

  describe("Data Cleanup and Retention", () => {
    it("should clean up expired pseudonym cache entries", async () => {
      const originalHash = `test-${uuidv4()}`;
      const pseudonym = `pseudo-${uuidv4()}`;

      // Insert an expired entry (well in the past)
      await pool.query(
        `INSERT INTO pseudonym_cache (original_hash, pseudonym, data_type, expires_at) 
         VALUES ($1, $2, $3, $4)`,
        [originalHash, pseudonym, "ssn", new Date(Date.now() - 60000)], // 1 minute ago
      );

      // Verify the entry exists before cleanup
      let result = await pool.query(
        "SELECT * FROM pseudonym_cache WHERE original_hash = $1",
        [originalHash],
      );
      expect(result.rows).toHaveLength(1);

      // Run cleanup function
      await pool.query("SELECT cleanup_expired_pseudonyms()");

      // Verify the expired entry was removed
      result = await pool.query(
        "SELECT * FROM pseudonym_cache WHERE original_hash = $1",
        [originalHash],
      );
      expect(result.rows).toHaveLength(0);
    });

    it("should execute cleanup_conversation_data procedure", async () => {
      // Insert test data with old timestamps
      const oldSessionId = `test-old-${uuidv4()}`;
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago

      await pool.query(
        `INSERT INTO conversation_events (session_id, thread_id, node, event_type, payload, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          oldSessionId,
          "thread-1",
          "test_node",
          "session_started",
          JSON.stringify({}),
          oldDate,
        ],
      );

      await pool.query(
        `INSERT INTO graph_nodes (session_id, node_name, node_type, status, created_at) 
         VALUES ($1, $2, $3, $4, $5)`,
        [oldSessionId, "test_node", "verification", "completed", oldDate],
      );

      // Run cleanup with 90-day retention
      const result = await pool.query(
        "SELECT * FROM cleanup_conversation_data(90, 365)",
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].events_deleted).toBeGreaterThanOrEqual(1);
      expect(result.rows[0].graph_nodes_deleted).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Analytics Views Security", () => {
    it("should provide safe conversation_analytics view", async () => {
      const sessionId = `test-${uuidv4()}`;
      const threadId = `thread-${uuidv4()}`;

      // Insert test data with safe metadata
      await pool.query(
        `INSERT INTO conversation_events (session_id, thread_id, node, event_type, payload) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          sessionId,
          threadId,
          "test_node",
          "session_started",
          JSON.stringify({ event_count: 1, duration_ms: 500 }),
        ],
      );

      const result = await pool.query(
        "SELECT * FROM conversation_analytics WHERE session_id = $1",
        [sessionId],
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].safe_metadata).toEqual({ event_count: 1 });
      expect(result.rows[0]).not.toHaveProperty("payload");
    });

    it("should provide safe audit_trail view", async () => {
      const sessionId = `test-${uuidv4()}`;

      // Insert test audit data
      await pool.query(
        `INSERT INTO audit_events (session_id, event_type, operation, outcome, pseudonymized_summary) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          sessionId,
          "session_started",
          "create_session",
          "success",
          JSON.stringify({ action: "session_created" }),
        ],
      );

      const result = await pool.query(
        "SELECT * FROM audit_trail WHERE session_id = $1",
        [sessionId],
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].pseudonymized_summary).toEqual({
        action: "session_created",
      });
      expect(result.rows[0].session_id).toBe(sessionId);
    });

    it("should provide safe conversation_graph view", async () => {
      const sessionId = `test-${uuidv4()}`;

      // Insert test graph data
      await pool.query(
        `INSERT INTO graph_nodes (session_id, node_name, node_type, status, metadata) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          sessionId,
          "identity",
          "verification",
          "completed",
          JSON.stringify({ attempt_count: 1, success_rate: 1.0 }),
        ],
      );

      await pool.query(
        `INSERT INTO graph_edges (session_id, from_node, to_node, condition_met) 
         VALUES ($1, $2, $3, $4)`,
        [sessionId, "identity", "contact", "identity_verified"],
      );

      const result = await pool.query(
        "SELECT * FROM conversation_graph WHERE session_id = $1",
        [sessionId],
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].safe_metadata).toEqual({ attempt_count: 1 });
      expect(result.rows[0].transitions).toHaveLength(1);
      expect(result.rows[0].transitions[0].to_node).toBe("contact");
    });
  });
});
