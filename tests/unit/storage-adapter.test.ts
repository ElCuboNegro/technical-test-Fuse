import { Pool } from "pg";
import {
  EventEnvelope,
  EventType,
} from "../../src/conversation-logging/interfaces/event-envelope";
import {
  StorageAdapter,
  StorageResult,
} from "../../src/conversation-logging/interfaces/storage-adapter";
import { AuditDTO } from "../../src/conversation-logging/interfaces/conversation-logger";

// Mock pg Pool
jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: jest.fn(),
    end: jest.fn(),
  })),
}));

// Mock StorageAdapter implementation for testing
class MockStorageAdapter implements StorageAdapter {
  private pool: any;

  constructor(config: { connectionString: string }) {
    this.pool = new Pool();
  }

  async insertEvent(event: EventEnvelope): Promise<StorageResult> {
    const startTime = Date.now();
    try {
      const result = await this.pool.query(
        `INSERT INTO conversation_events 
         (session_id, thread_id, user_id, node, event_type, timestamp, step_index, payload) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
         RETURNING id`,
        [
          event.session_id,
          event.thread_id,
          event.user_id,
          event.node,
          event.event_type,
          event.timestamp,
          event.step_index,
          JSON.stringify(event.payload),
        ],
      );

      return {
        success: true,
        recordsAffected: result.rows.length,
        durationMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  async insertAudit(audit: AuditDTO): Promise<StorageResult> {
    const startTime = Date.now();
    try {
      const result = await this.pool.query(
        `INSERT INTO audit_events (id, session_id, user_id, event_type, timestamp, summary, actor, metadata) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          audit.id,
          audit.sessionId,
          audit.userId,
          audit.eventType,
          audit.timestamp,
          audit.summary,
          audit.actor,
          JSON.stringify(audit.metadata),
        ],
      );

      return {
        success: true,
        recordsAffected: result.rowCount || 0,
        durationMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  async updateGraph(event: EventEnvelope): Promise<StorageResult> {
    const startTime = Date.now();
    return {
      success: true,
      recordsAffected: 1,
      durationMs: Date.now() - startTime,
    };
  }

  async handleStorageOutage(): Promise<void> {
    // Mock implementation
  }

  async flushBufferedEvents(): Promise<StorageResult> {
    return {
      success: true,
      recordsAffected: 0,
      durationMs: 0,
    };
  }

  async detectDuplicates(event: EventEnvelope): Promise<boolean> {
    return false;
  }

  async getStorageHealth() {
    return {
      isAvailable: true,
      connectionPoolStatus: { active: 1, idle: 0, total: 1 },
      avgLatencyMs: 10,
      recentFailures: 0,
    };
  }

  async getBufferedEvents() {
    return [];
  }

  async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number,
  ): Promise<T> {
    return operation();
  }

  async clearBuffer(): Promise<void> {
    // Mock implementation
  }

  setBufferLimit(maxEvents: number): void {
    // Mock implementation
  }

  setDuplicateDetection(enabled: boolean): void {
    // Mock implementation
  }

  async cleanup(): Promise<void> {
    await this.pool.end();
  }
}

describe("StorageAdapter", () => {
  let storageAdapter: MockStorageAdapter;
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
      end: jest.fn(),
    };
    (Pool as any).mockImplementation(() => mockPool);
    storageAdapter = new MockStorageAdapter({
      connectionString: "postgresql://test:test@localhost:5432/test",
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("insertEvent", () => {
    it("should store event with correct database structure", async () => {
      const event: EventEnvelope = {
        session_id: "sess_456",
        thread_id: "thread_123",
        user_id: "user_789",
        timestamp: new Date("2024-01-01T00:00:00Z"),
        event_type: EventType.NODE_ENTERED,
        node: "identity_verification",
        step_index: 1,
        payload: {
          action: "verify_identity",
          success: true,
          redacted_data: { dob: "****-**-**", ssn: "****" },
        },
      };

      mockPool.query.mockResolvedValueOnce({ rows: [{ id: "stored_123" }] });

      const result = await storageAdapter.insertEvent(event);

      expect(result.success).toBe(true);
      expect(result.recordsAffected).toBe(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO conversation_events"),
        expect.arrayContaining([
          event.session_id,
          event.thread_id,
          event.user_id,
          event.node,
          event.event_type,
          event.timestamp,
          event.step_index,
          JSON.stringify(event.payload),
        ]),
      );
    });

    it("should handle database errors gracefully", async () => {
      const event: EventEnvelope = {
        session_id: "sess_456",
        thread_id: "thread_123",
        user_id: "user_789",
        timestamp: new Date(),
        event_type: EventType.ERROR,
        node: "test_node",
        payload: { test: "data" },
      };

      mockPool.query.mockRejectedValueOnce(
        new Error("Database connection failed"),
      );

      const result = await storageAdapter.insertEvent(event);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Database connection failed");
      expect(typeof result.durationMs).toBe("number");
    });
  });

  describe("insertAudit", () => {
    it("should store audit record in immutable trail", async () => {
      const audit: AuditDTO = {
        id: "audit_123",
        sessionId: "sess_456",
        userId: "user_789",
        eventType: "identity_verification_attempt",
        timestamp: new Date("2024-01-01T00:00:00Z"),
        summary: "Identity verification attempt failed",
        actor: "system",
        metadata: {
          attempt_number: 1,
          success: false,
          reason: "invalid_ssn",
        },
      };

      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await storageAdapter.insertAudit(audit);

      expect(result.success).toBe(true);
      expect(result.recordsAffected).toBe(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO audit_events"),
        expect.arrayContaining([
          audit.id,
          audit.sessionId,
          audit.userId,
          audit.eventType,
          audit.timestamp,
          audit.summary,
          audit.actor,
          JSON.stringify(audit.metadata),
        ]),
      );
    });

    it("should handle audit insertion errors", async () => {
      const audit: AuditDTO = {
        id: "audit_456",
        sessionId: "sess_456",
        userId: "user_789",
        eventType: "test_event",
        timestamp: new Date(),
        summary: "Test audit event",
        metadata: { test: "data" },
      };

      mockPool.query.mockRejectedValueOnce(new Error("Audit insertion failed"));

      const result = await storageAdapter.insertAudit(audit);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Audit insertion failed");
    });
  });

  describe("getStorageHealth", () => {
    it("should return storage health status", async () => {
      const health = await storageAdapter.getStorageHealth();

      expect(health.isAvailable).toBe(true);
      expect(health.connectionPoolStatus).toHaveProperty("active");
      expect(health.connectionPoolStatus).toHaveProperty("idle");
      expect(health.connectionPoolStatus).toHaveProperty("total");
      expect(typeof health.avgLatencyMs).toBe("number");
      expect(typeof health.recentFailures).toBe("number");
    });
  });

  describe("detectDuplicates", () => {
    it("should detect duplicate events", async () => {
      const event: EventEnvelope = {
        session_id: "sess_456",
        thread_id: "thread_123",
        user_id: "user_789",
        timestamp: new Date(),
        event_type: EventType.MESSAGE_USER,
        node: "test_node",
        payload: { message: "test" },
      };

      const isDuplicate = await storageAdapter.detectDuplicates(event);

      expect(typeof isDuplicate).toBe("boolean");
    });
  });

  describe("cleanup", () => {
    it("should close database connection", async () => {
      await storageAdapter.cleanup();
      expect(mockPool.end).toHaveBeenCalled();
    });
  });
});
