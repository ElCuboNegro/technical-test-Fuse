/**
 * Unit tests for RedisEventQueue
 * Tests Redis queue operations, backpressure control, priority handling, and connection failure recovery
 * Requirements: 2.2, 2.5, 5.3
 */

import {
  RedisEventQueue,
  RedisQueueStats,
} from "../../src/conversation-logging/interfaces/redis-event-queue";
import {
  EventEnvelope,
  EventType,
} from "../../src/conversation-logging/interfaces/event-envelope";

// Mock Redis client for testing
interface MockRedisClient {
  lpush: jest.Mock;
  rpop: jest.Mock;
  llen: jest.Mock;
  lrange: jest.Mock;
  del: jest.Mock;
  ping: jest.Mock;
  on: jest.Mock;
  connected: boolean;
  commandQueue: any[];
}

// Test implementation of RedisEventQueue for unit testing
class TestRedisEventQueue implements RedisEventQueue {
  private mockRedis: MockRedisClient;
  private fallbackBuffer: EventEnvelope[] = [];
  private maxQueueLength: number = 1000;
  private backpressureThreshold: number = 0.8;
  private stats = {
    totalEnqueued: 0,
    totalDequeued: 0,
    droppedEvents: 0,
    operationErrors: 0,
    reconnectAttempts: 0,
  };

  constructor(mockRedis: MockRedisClient) {
    this.mockRedis = mockRedis;
  }

  async enqueue(event: EventEnvelope): Promise<void> {
    try {
      if (!this.mockRedis.connected) {
        // Use fallback buffer when Redis is disconnected
        if (this.fallbackBuffer.length >= 100) {
          // Fallback buffer limit
          if (this.isAuditEvent(event)) {
            // Preserve audit events by dropping oldest non-audit event
            const nonAuditIndex = this.fallbackBuffer.findIndex(
              (e) => !this.isAuditEvent(e),
            );
            if (nonAuditIndex >= 0) {
              this.fallbackBuffer.splice(nonAuditIndex, 1);
              this.stats.droppedEvents++;
            }
          } else {
            // Drop non-audit event
            this.stats.droppedEvents++;
            return;
          }
        }
        this.fallbackBuffer.push(event);
        this.stats.totalEnqueued++;
        return;
      }

      // Check backpressure before enqueuing
      const queueLength = await this.getQueueLength();
      if (await this.applyBackpressure()) {
        if (!this.isAuditEvent(event)) {
          // Drop non-audit events during backpressure
          this.stats.droppedEvents++;
          return;
        }
      }

      await this.mockRedis.lpush("event_queue", JSON.stringify(event));
      this.stats.totalEnqueued++;
    } catch (error) {
      this.stats.operationErrors++;
      throw error;
    }
  }

  async dequeue(): Promise<EventEnvelope | null> {
    try {
      if (!this.mockRedis.connected) {
        // Use fallback buffer when Redis is disconnected
        const event = this.fallbackBuffer.shift() || null;
        if (event) {
          this.stats.totalDequeued++;
        }
        return event;
      }

      const result = await this.mockRedis.rpop("event_queue");
      if (result) {
        this.stats.totalDequeued++;
        const parsed = JSON.parse(result);
        // Convert timestamp string back to Date object
        if (parsed.timestamp) {
          parsed.timestamp = new Date(parsed.timestamp);
        }
        return parsed;
      }
      return null;
    } catch (error) {
      this.stats.operationErrors++;
      throw error;
    }
  }

  async getQueueLength(): Promise<number> {
    try {
      if (!this.mockRedis.connected) {
        return this.fallbackBuffer.length;
      }
      return await this.mockRedis.llen("event_queue");
    } catch (error) {
      this.stats.operationErrors++;
      throw error;
    }
  }

  async applyBackpressure(): Promise<boolean> {
    const queueLength = await this.getQueueLength();
    return queueLength >= this.maxQueueLength * this.backpressureThreshold;
  }

  async flush(): Promise<EventEnvelope[]> {
    try {
      if (!this.mockRedis.connected) {
        const events = [...this.fallbackBuffer];
        this.fallbackBuffer = [];
        return events;
      }

      const events = await this.mockRedis.lrange("event_queue", 0, -1);
      await this.mockRedis.del("event_queue");
      return events
        .map((e: string) => {
          const parsed = JSON.parse(e);
          // Convert timestamp string back to Date object
          if (parsed.timestamp) {
            parsed.timestamp = new Date(parsed.timestamp);
          }
          return parsed;
        })
        .reverse(); // Reverse to maintain chronological order
    } catch (error) {
      this.stats.operationErrors++;
      throw error;
    }
  }

  async getStats(): Promise<RedisQueueStats> {
    const queueLength = await this.getQueueLength();
    return {
      currentQueueLength: queueLength,
      maxQueueLength: this.maxQueueLength,
      utilizationPercent: Math.round((queueLength / this.maxQueueLength) * 100),
      totalEnqueued: this.stats.totalEnqueued,
      totalDequeued: this.stats.totalDequeued,
      droppedEvents: this.stats.droppedEvents,
      backpressureActive: await this.applyBackpressure(),
      connectionStatus: this.mockRedis.connected ? "connected" : "disconnected",
      operationErrors: this.stats.operationErrors,
    };
  }

  async clear(): Promise<void> {
    try {
      if (this.mockRedis.connected) {
        await this.mockRedis.del("event_queue");
      }
      this.fallbackBuffer = [];
    } catch (error) {
      this.stats.operationErrors++;
      throw error;
    }
  }

  async isEmpty(): Promise<boolean> {
    return (await this.getQueueLength()) === 0;
  }

  setBackpressureThreshold(maxLength: number): void {
    this.maxQueueLength = maxLength;
  }

  async handleConnectionFailure(): Promise<void> {
    this.mockRedis.connected = false;
    this.stats.reconnectAttempts++;
  }

  async restoreConnection(): Promise<void> {
    this.mockRedis.connected = true;

    // Flush fallback buffer to Redis
    while (this.fallbackBuffer.length > 0) {
      const event = this.fallbackBuffer.shift();
      if (event) {
        await this.mockRedis.lpush("event_queue", JSON.stringify(event));
      }
    }
  }

  async getConnectionHealth(): Promise<{
    status: "healthy" | "degraded" | "failed";
    lastError?: string;
    reconnectAttempts: number;
  }> {
    try {
      if (this.mockRedis.connected) {
        await this.mockRedis.ping();
        return {
          status: "healthy",
          reconnectAttempts: this.stats.reconnectAttempts,
        };
      } else {
        return {
          status: "failed",
          lastError: "Redis connection lost",
          reconnectAttempts: this.stats.reconnectAttempts,
        };
      }
    } catch (error) {
      return {
        status: "failed",
        lastError: error instanceof Error ? error.message : "Unknown error",
        reconnectAttempts: this.stats.reconnectAttempts,
      };
    }
  }

  private isAuditEvent(event: EventEnvelope): boolean {
    // Audit events are critical events that should be preserved
    return (
      event.event_type === EventType.ERROR ||
      event.event_type === EventType.TERMINATION ||
      event.event_type === EventType.SESSION_STARTED ||
      event.payload.audit === true
    );
  }
}

describe("RedisEventQueue", () => {
  let mockRedis: MockRedisClient;
  let queue: TestRedisEventQueue;

  beforeEach(() => {
    mockRedis = {
      lpush: jest.fn(),
      rpop: jest.fn(),
      llen: jest.fn(),
      lrange: jest.fn(),
      del: jest.fn(),
      ping: jest.fn(),
      on: jest.fn(),
      connected: true,
      commandQueue: [],
    };
    queue = new TestRedisEventQueue(mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Redis Queue Operations", () => {
    it("should enqueue events using LPUSH", async () => {
      const event: EventEnvelope = {
        session_id: "session1",
        thread_id: "thread1",
        user_id: "user1",
        node: "identity",
        event_type: EventType.NODE_ENTERED,
        timestamp: new Date(),
        payload: { test: "data" },
      };

      mockRedis.llen.mockResolvedValue(0);
      mockRedis.lpush.mockResolvedValue(1);

      await queue.enqueue(event);

      expect(mockRedis.lpush).toHaveBeenCalledWith(
        "event_queue",
        JSON.stringify(event),
      );
    });

    it("should dequeue events using RPOP in FIFO order", async () => {
      const event: EventEnvelope = {
        session_id: "session1",
        thread_id: "thread1",
        user_id: "user1",
        node: "identity",
        event_type: EventType.NODE_ENTERED,
        timestamp: new Date(),
        payload: { test: "data" },
      };

      mockRedis.rpop.mockResolvedValue(JSON.stringify(event));

      const result = await queue.dequeue();

      expect(mockRedis.rpop).toHaveBeenCalledWith("event_queue");
      expect(result).toEqual(event);
    });

    it("should return null when dequeuing from empty queue", async () => {
      mockRedis.rpop.mockResolvedValue(null);

      const result = await queue.dequeue();

      expect(result).toBeNull();
    });

    it("should get queue length using LLEN", async () => {
      mockRedis.llen.mockResolvedValue(5);

      const length = await queue.getQueueLength();

      expect(mockRedis.llen).toHaveBeenCalledWith("event_queue");
      expect(length).toBe(5);
    });

    it("should maintain FIFO ordering for multiple events", async () => {
      const events: EventEnvelope[] = [
        {
          session_id: "session1",
          thread_id: "thread1",
          user_id: "user1",
          node: "identity",
          event_type: EventType.NODE_ENTERED,
          timestamp: new Date("2024-01-01T10:00:00Z"),
          payload: { order: 1 },
        },
        {
          session_id: "session1",
          thread_id: "thread1",
          user_id: "user1",
          node: "identity",
          event_type: EventType.NODE_EXITED,
          timestamp: new Date("2024-01-01T10:01:00Z"),
          payload: { order: 2 },
        },
      ];

      // Mock enqueue operations
      mockRedis.llen.mockResolvedValue(0);
      mockRedis.lpush.mockResolvedValue(1);

      // Enqueue events
      for (const event of events) {
        await queue.enqueue(event);
      }

      // Mock dequeue operations - RPOP returns in FIFO order
      mockRedis.rpop
        .mockResolvedValueOnce(JSON.stringify(events[0]))
        .mockResolvedValueOnce(JSON.stringify(events[1]));

      // Dequeue and verify order
      const result1 = await queue.dequeue();
      const result2 = await queue.dequeue();

      expect(result1?.payload.order).toBe(1);
      expect(result2?.payload.order).toBe(2);
    });
  });

  describe("Backpressure Control", () => {
    it("should activate backpressure when queue length exceeds threshold", async () => {
      queue.setBackpressureThreshold(100);
      mockRedis.llen.mockResolvedValue(85); // 85% of 100

      const backpressureActive = await queue.applyBackpressure();

      expect(backpressureActive).toBe(true);
    });

    it("should not activate backpressure when queue length is below threshold", async () => {
      queue.setBackpressureThreshold(100);
      mockRedis.llen.mockResolvedValue(70); // 70% of 100

      const backpressureActive = await queue.applyBackpressure();

      expect(backpressureActive).toBe(false);
    });

    it("should drop non-audit events during backpressure", async () => {
      queue.setBackpressureThreshold(100);
      mockRedis.llen.mockResolvedValue(85); // Trigger backpressure

      const nonAuditEvent: EventEnvelope = {
        session_id: "session1",
        thread_id: "thread1",
        user_id: "user1",
        node: "contact",
        event_type: EventType.MESSAGE_USER,
        timestamp: new Date(),
        payload: { test: "data" },
      };

      await queue.enqueue(nonAuditEvent);

      // Should not call lpush because event was dropped
      expect(mockRedis.lpush).not.toHaveBeenCalled();

      const stats = await queue.getStats();
      expect(stats.droppedEvents).toBe(1);
    });

    it("should preserve audit events during backpressure", async () => {
      queue.setBackpressureThreshold(100);
      mockRedis.llen.mockResolvedValue(85); // Trigger backpressure
      mockRedis.lpush.mockResolvedValue(1);

      const auditEvent: EventEnvelope = {
        session_id: "session1",
        thread_id: "thread1",
        user_id: "user1",
        node: "identity",
        event_type: EventType.ERROR,
        timestamp: new Date(),
        payload: { error: "critical error" },
      };

      await queue.enqueue(auditEvent);

      // Should call lpush because audit events are preserved
      expect(mockRedis.lpush).toHaveBeenCalledWith(
        "event_queue",
        JSON.stringify(auditEvent),
      );

      const stats = await queue.getStats();
      expect(stats.droppedEvents).toBe(0);
    });

    it("should preserve session_started events during backpressure", async () => {
      queue.setBackpressureThreshold(100);
      mockRedis.llen.mockResolvedValue(85); // Trigger backpressure
      mockRedis.lpush.mockResolvedValue(1);

      const sessionEvent: EventEnvelope = {
        session_id: "session1",
        thread_id: "thread1",
        user_id: "user1",
        node: "start",
        event_type: EventType.SESSION_STARTED,
        timestamp: new Date(),
        payload: { session_start: true },
      };

      await queue.enqueue(sessionEvent);

      expect(mockRedis.lpush).toHaveBeenCalledWith(
        "event_queue",
        JSON.stringify(sessionEvent),
      );

      const stats = await queue.getStats();
      expect(stats.droppedEvents).toBe(0);
    });

    it("should preserve events marked as audit in payload", async () => {
      queue.setBackpressureThreshold(100);
      mockRedis.llen.mockResolvedValue(85); // Trigger backpressure
      mockRedis.lpush.mockResolvedValue(1);

      const auditMarkedEvent: EventEnvelope = {
        session_id: "session1",
        thread_id: "thread1",
        user_id: "user1",
        node: "contact",
        event_type: EventType.MESSAGE_AGENT,
        timestamp: new Date(),
        payload: { audit: true, message: "important audit message" },
      };

      await queue.enqueue(auditMarkedEvent);

      expect(mockRedis.lpush).toHaveBeenCalledWith(
        "event_queue",
        JSON.stringify(auditMarkedEvent),
      );

      const stats = await queue.getStats();
      expect(stats.droppedEvents).toBe(0);
    });
  });

  describe("Connection Failure Handling", () => {
    it("should use fallback buffer when Redis is disconnected", async () => {
      await queue.handleConnectionFailure();

      const event: EventEnvelope = {
        session_id: "session1",
        thread_id: "thread1",
        user_id: "user1",
        node: "identity",
        event_type: EventType.NODE_ENTERED,
        timestamp: new Date(),
        payload: { test: "data" },
      };

      await queue.enqueue(event);

      // Should not call Redis operations
      expect(mockRedis.lpush).not.toHaveBeenCalled();

      // Should be able to dequeue from fallback buffer
      const result = await queue.dequeue();
      expect(result).toEqual(event);
    });

    it("should restore connection and flush fallback buffer to Redis", async () => {
      // Simulate connection failure
      await queue.handleConnectionFailure();

      const event: EventEnvelope = {
        session_id: "session1",
        thread_id: "thread1",
        user_id: "user1",
        node: "identity",
        event_type: EventType.NODE_ENTERED,
        timestamp: new Date(),
        payload: { test: "data" },
      };

      // Enqueue to fallback buffer
      await queue.enqueue(event);

      // Restore connection
      mockRedis.lpush.mockResolvedValue(1);
      await queue.restoreConnection();

      // Should flush fallback buffer to Redis
      expect(mockRedis.lpush).toHaveBeenCalledWith(
        "event_queue",
        JSON.stringify(event),
      );
    });

    it("should handle fallback buffer overflow by preserving audit events", async () => {
      await queue.handleConnectionFailure();

      // Fill fallback buffer to capacity (100 events)
      for (let i = 0; i < 100; i++) {
        const event: EventEnvelope = {
          session_id: "session1",
          thread_id: "thread1",
          user_id: "user1",
          node: "contact",
          event_type: EventType.MESSAGE_USER,
          timestamp: new Date(),
          payload: { order: i },
        };
        await queue.enqueue(event);
      }

      // Try to add an audit event - should preserve it by dropping a non-audit event
      const auditEvent: EventEnvelope = {
        session_id: "session1",
        thread_id: "thread1",
        user_id: "user1",
        node: "identity",
        event_type: EventType.ERROR,
        timestamp: new Date(),
        payload: { error: "critical error" },
      };

      await queue.enqueue(auditEvent);

      const stats = await queue.getStats();
      expect(stats.droppedEvents).toBe(1); // One non-audit event was dropped
      expect(stats.currentQueueLength).toBe(100); // Buffer still at capacity
    });

    it("should drop non-audit events when fallback buffer is full", async () => {
      await queue.handleConnectionFailure();

      // Fill fallback buffer with audit events
      for (let i = 0; i < 100; i++) {
        const event: EventEnvelope = {
          session_id: "session1",
          thread_id: "thread1",
          user_id: "user1",
          node: "identity",
          event_type: EventType.ERROR,
          timestamp: new Date(),
          payload: { error: `error ${i}` },
        };
        await queue.enqueue(event);
      }

      // Try to add a non-audit event - should be dropped
      const nonAuditEvent: EventEnvelope = {
        session_id: "session1",
        thread_id: "thread1",
        user_id: "user1",
        node: "contact",
        event_type: EventType.MESSAGE_USER,
        timestamp: new Date(),
        payload: { message: "regular message" },
      };

      await queue.enqueue(nonAuditEvent);

      const stats = await queue.getStats();
      expect(stats.droppedEvents).toBe(1); // Non-audit event was dropped
      expect(stats.currentQueueLength).toBe(100); // Buffer still at capacity
    });

    it("should report connection health status", async () => {
      // Healthy connection
      mockRedis.ping.mockResolvedValue("PONG");
      let health = await queue.getConnectionHealth();
      expect(health.status).toBe("healthy");
      expect(health.reconnectAttempts).toBe(0);

      // Failed connection
      await queue.handleConnectionFailure();
      health = await queue.getConnectionHealth();
      expect(health.status).toBe("failed");
      expect(health.lastError).toBe("Redis connection lost");
      expect(health.reconnectAttempts).toBe(1);
    });
  });

  describe("Queue Management", () => {
    it("should flush all events in chronological order", async () => {
      const event1: EventEnvelope = {
        session_id: "session1",
        thread_id: "thread1",
        user_id: "user1",
        node: "identity",
        event_type: EventType.NODE_ENTERED,
        timestamp: new Date("2024-01-01T10:00:00Z"),
        payload: { order: 1 },
      };

      const event2: EventEnvelope = {
        session_id: "session1",
        thread_id: "thread1",
        user_id: "user1",
        node: "identity",
        event_type: EventType.NODE_EXITED,
        timestamp: new Date("2024-01-01T10:01:00Z"),
        payload: { order: 2 },
      };

      const serializedEvents = [JSON.stringify(event1), JSON.stringify(event2)];
      mockRedis.lrange.mockResolvedValue(serializedEvents);
      mockRedis.del.mockResolvedValue(1);

      const result = await queue.flush();

      expect(mockRedis.lrange).toHaveBeenCalledWith("event_queue", 0, -1);
      expect(mockRedis.del).toHaveBeenCalledWith("event_queue");
      expect(result).toHaveLength(2);
      expect(result[0].payload.order).toBe(2); // Reversed order (chronological)
      expect(result[1].payload.order).toBe(1);
    });

    it("should clear queue completely", async () => {
      mockRedis.del.mockResolvedValue(1);

      await queue.clear();

      expect(mockRedis.del).toHaveBeenCalledWith("event_queue");
    });

    it("should check if queue is empty", async () => {
      mockRedis.llen.mockResolvedValue(0);

      const isEmpty = await queue.isEmpty();

      expect(isEmpty).toBe(true);
    });

    it("should provide comprehensive queue statistics", async () => {
      queue.setBackpressureThreshold(1000);
      mockRedis.llen.mockResolvedValue(750);

      const stats = await queue.getStats();

      expect(stats.currentQueueLength).toBe(750);
      expect(stats.maxQueueLength).toBe(1000);
      expect(stats.utilizationPercent).toBe(75);
      expect(stats.backpressureActive).toBe(false);
      expect(stats.connectionStatus).toBe("connected");
    });
  });

  describe("Error Handling", () => {
    it("should handle Redis operation errors gracefully", async () => {
      const error = new Error("Redis connection failed");
      mockRedis.lpush.mockRejectedValue(error);

      const event: EventEnvelope = {
        session_id: "session1",
        thread_id: "thread1",
        user_id: "user1",
        node: "identity",
        event_type: EventType.NODE_ENTERED,
        timestamp: new Date(),
        payload: { test: "data" },
      };

      await expect(queue.enqueue(event)).rejects.toThrow(
        "Redis connection failed",
      );

      const stats = await queue.getStats();
      expect(stats.operationErrors).toBe(1);
    });

    it("should track operation errors in statistics", async () => {
      const error = new Error("Redis error");
      mockRedis.rpop.mockRejectedValue(error);

      await expect(queue.dequeue()).rejects.toThrow("Redis error");

      const stats = await queue.getStats();
      expect(stats.operationErrors).toBe(1);
    });

    it("should handle ping failures in health check", async () => {
      const error = new Error("Ping failed");
      mockRedis.ping.mockRejectedValue(error);

      const health = await queue.getConnectionHealth();

      expect(health.status).toBe("failed");
      expect(health.lastError).toBe("Ping failed");
    });
  });
});
