/**
 * Unit tests for conversation logging system
 * Tests the EventCollector implementation and ConversationLogger interface
 */

import {
  EventCollector,
  EventCollectorConfig,
  DEFAULT_EVENT_COLLECTOR_CONFIG,
} from "../../src/conversation-logging/collectors/event-collector";
import {
  EventEnvelope,
  EventType,
} from "../../src/conversation-logging/interfaces/event-envelope";
import { RedisEventQueue } from "../../src/conversation-logging/interfaces/redis-event-queue";
import { PseudonymizationEngine } from "../../src/conversation-logging/interfaces/pseudonymization-engine";

// Mock implementations
class MockRedisEventQueue implements RedisEventQueue {
  private enqueuedEvents: EventEnvelope[] = [];
  private shouldFail = false;

  async enqueue(event: EventEnvelope): Promise<void> {
    if (this.shouldFail) {
      throw new Error("Mock queue failure");
    }
    this.enqueuedEvents.push(event);
  }

  async dequeue(): Promise<EventEnvelope | null> {
    return this.enqueuedEvents.shift() || null;
  }

  async getQueueLength(): Promise<number> {
    return this.enqueuedEvents.length;
  }

  async applyBackpressure(): Promise<boolean> {
    return this.enqueuedEvents.length > 100;
  }

  async flush(): Promise<EventEnvelope[]> {
    const events = [...this.enqueuedEvents];
    this.enqueuedEvents = [];
    return events;
  }

  async getStats(): Promise<any> {
    return {
      currentQueueLength: this.enqueuedEvents.length,
      maxQueueLength: 1000,
      utilizationPercent: 0,
      totalEnqueued: 0,
      totalDequeued: 0,
      droppedEvents: 0,
      backpressureActive: false,
      connectionStatus: "connected",
      operationErrors: 0,
    };
  }

  async clear(): Promise<void> {
    this.enqueuedEvents = [];
  }

  async isEmpty(): Promise<boolean> {
    return this.enqueuedEvents.length === 0;
  }

  setBackpressureThreshold(maxLength: number): void {
    // Mock implementation
  }

  async handleConnectionFailure(): Promise<void> {
    // Mock implementation
  }

  async restoreConnection(): Promise<void> {
    // Mock implementation
  }

  async getConnectionHealth(): Promise<any> {
    return {
      status: "healthy",
      reconnectAttempts: 0,
    };
  }

  async close(): Promise<void> {
    // Mock implementation
  }

  // Test helper methods
  getEnqueuedEvents(): EventEnvelope[] {
    return [...this.enqueuedEvents];
  }

  setFailure(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }
}

class MockPseudonymizationEngine implements PseudonymizationEngine {
  private shouldFail = false;

  async pseudonymizePayload(
    payload: Record<string, any>,
  ): Promise<Record<string, any>> {
    if (this.shouldFail) {
      throw new Error("Mock pseudonymization failure");
    }

    // Simple mock pseudonymization - replace sensitive fields
    const pseudonymized = { ...payload };
    if (pseudonymized.ssn) {
      pseudonymized.ssn =
        "PSEUDO_SSN_" + Math.random().toString(36).substr(2, 9);
    }
    if (pseudonymized.dob) {
      pseudonymized.dob =
        "PSEUDO_DOB_" + Math.random().toString(36).substr(2, 9);
    }
    if (pseudonymized.email) {
      pseudonymized.email = "pseudo@example.com";
    }

    return pseudonymized;
  }

  async generateUserPseudonym(userId: string): Promise<string> {
    return `PSEUDO_USER_${userId.slice(-4)}`;
  }

  handleFailure(field: string): string {
    return `[REDACTED_${field.toUpperCase()}]`;
  }

  async maskSSN(ssn: string): Promise<any> {
    return {
      masked: "****",
      hash: `hash_${ssn}`,
    };
  }

  async maskDOB(dob: string): Promise<any> {
    return {
      masked: "****-**-**",
      hash: `hash_${dob}`,
    };
  }

  async maskEmail(email: string): Promise<any> {
    return {
      masked: "****@****.***",
      domain: email.split("@")[1],
      hash: `hash_${email}`,
    };
  }

  async bucketIncome(income: number): Promise<string> {
    if (income < 50000) return "$0-$50K";
    if (income < 75000) return "$50K-$75K";
    if (income < 100000) return "$75K-$100K";
    return "$100K+";
  }

  async rotateSalts(): Promise<void> {
    // Mock implementation
  }

  setFailure(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }
}

describe("EventCollector", () => {
  let eventCollector: EventCollector;
  let mockQueue: MockRedisEventQueue;
  let mockPseudonymizer: MockPseudonymizationEngine;
  let testConfig: EventCollectorConfig;

  beforeEach(() => {
    mockQueue = new MockRedisEventQueue();
    mockPseudonymizer = new MockPseudonymizationEngine();
    testConfig = {
      ...DEFAULT_EVENT_COLLECTOR_CONFIG,
      operationTimeout: 100, // Shorter timeout for tests
      initialRetryDelay: 10,
      maxRetryDelay: 50,
    };
    eventCollector = new EventCollector(
      mockQueue,
      mockPseudonymizer,
      testConfig,
    );
  });

  afterEach(() => {
    eventCollector.clearProcessedEvents();
    mockQueue.clear();
  });

  describe("acceptEvent", () => {
    it("should accept and process valid events", async () => {
      const testEvent: EventEnvelope = {
        session_id: "test-session-1",
        thread_id: "test-thread-1",
        user_id: "test-user-1",
        node: "identity",
        event_type: EventType.NODE_ENTERED,
        timestamp: new Date(),
        step_index: 1,
        payload: { message: "test message" },
      };

      await eventCollector.acceptEvent(testEvent);

      // Wait for async processing to complete
      await eventCollector.waitForActiveOperations();

      const stats = eventCollector.getStats();
      expect(stats.totalEvents).toBe(1);
      expect(stats.successfulEvents).toBe(1);
      expect(stats.failedEvents).toBe(0);

      const enqueuedEvents = mockQueue.getEnqueuedEvents();
      expect(enqueuedEvents).toHaveLength(1);
      expect(enqueuedEvents[0].session_id).toBe(testEvent.session_id);
    });

    it("should reject events with invalid event types", async () => {
      const invalidEvent = {
        session_id: "test-session-1",
        thread_id: "test-thread-1",
        user_id: "test-user-1",
        node: "identity",
        event_type: "INVALID_TYPE" as EventType,
        timestamp: new Date(),
        payload: { message: "test message" },
      };

      await eventCollector.acceptEvent(invalidEvent);
      await eventCollector.waitForActiveOperations();

      const stats = eventCollector.getStats();
      expect(stats.totalEvents).toBe(1);
      expect(stats.failedEvents).toBe(1);
      expect(stats.successfulEvents).toBe(0);

      const enqueuedEvents = mockQueue.getEnqueuedEvents();
      expect(enqueuedEvents).toHaveLength(0);
    });

    it("should detect and ignore duplicate events", async () => {
      const testEvent: EventEnvelope = {
        session_id: "test-session-1",
        thread_id: "test-thread-1",
        user_id: "test-user-1",
        node: "identity",
        event_type: EventType.NODE_ENTERED,
        timestamp: new Date(),
        step_index: 1,
        payload: { message: "test message" },
      };

      // Send the same event twice
      await eventCollector.acceptEvent(testEvent);
      await eventCollector.acceptEvent(testEvent);

      await eventCollector.waitForActiveOperations();

      const stats = eventCollector.getStats();
      expect(stats.totalEvents).toBe(2);
      expect(stats.duplicateEvents).toBe(1);
      expect(stats.successfulEvents).toBe(1);

      const enqueuedEvents = mockQueue.getEnqueuedEvents();
      expect(enqueuedEvents).toHaveLength(1);
    });

    it("should pseudonymize event payload before enqueueing", async () => {
      const testEvent: EventEnvelope = {
        session_id: "test-session-1",
        thread_id: "test-thread-1",
        user_id: "test-user-1",
        node: "identity",
        event_type: EventType.MESSAGE_USER,
        timestamp: new Date(),
        payload: {
          ssn: "123456789",
          dob: "1990-01-01",
          email: "user@example.com",
        },
      };

      await eventCollector.acceptEvent(testEvent);
      await eventCollector.waitForActiveOperations();

      const enqueuedEvents = mockQueue.getEnqueuedEvents();
      expect(enqueuedEvents).toHaveLength(1);

      const enqueuedEvent = enqueuedEvents[0];
      expect(enqueuedEvent.payload.ssn).toMatch(/^PSEUDO_SSN_/);
      expect(enqueuedEvent.payload.dob).toMatch(/^PSEUDO_DOB_/);
      expect(enqueuedEvent.payload.email).toBe("pseudo@example.com");
    });

    it("should handle processing failures with retry logic", async () => {
      const testEvent: EventEnvelope = {
        session_id: "test-session-1",
        thread_id: "test-thread-1",
        user_id: "test-user-1",
        node: "identity",
        event_type: EventType.NODE_ENTERED,
        timestamp: new Date(),
        payload: { message: "test message" },
      };

      // Make the queue fail initially
      mockQueue.setFailure(true);

      await eventCollector.acceptEvent(testEvent);
      await eventCollector.waitForActiveOperations();

      const stats = eventCollector.getStats();
      expect(stats.totalEvents).toBe(1);
      expect(stats.failedEvents).toBe(1);
      expect(stats.totalRetries).toBeGreaterThan(0);
    });

    it("should handle pseudonymization failures", async () => {
      const testEvent: EventEnvelope = {
        session_id: "test-session-1",
        thread_id: "test-thread-1",
        user_id: "test-user-1",
        node: "identity",
        event_type: EventType.NODE_ENTERED,
        timestamp: new Date(),
        payload: { message: "test message" },
      };

      // Make pseudonymization fail
      mockPseudonymizer.setFailure(true);

      await eventCollector.acceptEvent(testEvent);
      await eventCollector.waitForActiveOperations();

      const stats = eventCollector.getStats();
      expect(stats.totalEvents).toBe(1);
      expect(stats.failedEvents).toBe(1);
      expect(stats.successfulEvents).toBe(0);
    });

    it("should not block caller during processing", async () => {
      const testEvent: EventEnvelope = {
        session_id: "test-session-1",
        thread_id: "test-thread-1",
        user_id: "test-user-1",
        node: "identity",
        event_type: EventType.NODE_ENTERED,
        timestamp: new Date(),
        payload: { message: "test message" },
      };

      const startTime = Date.now();
      await eventCollector.acceptEvent(testEvent);
      const endTime = Date.now();

      // acceptEvent should return quickly (within 50ms)
      expect(endTime - startTime).toBeLessThan(50);

      // But processing should still be active
      expect(eventCollector.getActiveOperationsCount()).toBe(1);

      await eventCollector.waitForActiveOperations();
      expect(eventCollector.getActiveOperationsCount()).toBe(0);
    });
  });

  describe("statistics tracking", () => {
    it("should track processing statistics correctly", async () => {
      const events: EventEnvelope[] = [
        {
          session_id: "test-session-1",
          thread_id: "test-thread-1",
          user_id: "test-user-1",
          node: "identity",
          event_type: EventType.NODE_ENTERED,
          timestamp: new Date(),
          payload: { message: "message 1" },
        },
        {
          session_id: "test-session-2",
          thread_id: "test-thread-2",
          user_id: "test-user-2",
          node: "contact",
          event_type: EventType.NODE_EXITED,
          timestamp: new Date(),
          payload: { message: "message 2" },
        },
      ];

      for (const event of events) {
        await eventCollector.acceptEvent(event);
      }

      await eventCollector.waitForActiveOperations();

      const stats = eventCollector.getStats();
      expect(stats.totalEvents).toBe(2);
      expect(stats.successfulEvents).toBe(2);
      expect(stats.failedEvents).toBe(0);
      expect(stats.duplicateEvents).toBe(0);
      expect(stats.avgProcessingTime).toBeGreaterThanOrEqual(0);
    });

    it("should update average processing time correctly", async () => {
      const testEvent: EventEnvelope = {
        session_id: "test-session-1",
        thread_id: "test-thread-1",
        user_id: "test-user-1",
        node: "identity",
        event_type: EventType.NODE_ENTERED,
        timestamp: new Date(),
        payload: { message: "test message" },
      };

      await eventCollector.acceptEvent(testEvent);
      await eventCollector.waitForActiveOperations();

      const stats = eventCollector.getStats();
      expect(stats.avgProcessingTime).toBeGreaterThanOrEqual(0);
      expect(typeof stats.avgProcessingTime).toBe("number");
    });
  });

  describe("configuration", () => {
    it("should use default configuration when none provided", () => {
      const defaultCollector = new EventCollector(mockQueue, mockPseudonymizer);
      expect(defaultCollector).toBeDefined();
    });

    it("should respect custom configuration", async () => {
      const customConfig: EventCollectorConfig = {
        maxRetries: 1,
        initialRetryDelay: 5,
        backoffMultiplier: 1.5,
        maxRetryDelay: 20,
        operationTimeout: 50,
      };

      const customCollector = new EventCollector(
        mockQueue,
        mockPseudonymizer,
        customConfig,
      );

      // Make queue fail to test retry logic with custom config
      mockQueue.setFailure(true);

      const testEvent: EventEnvelope = {
        session_id: "test-session-1",
        thread_id: "test-thread-1",
        user_id: "test-user-1",
        node: "identity",
        event_type: EventType.NODE_ENTERED,
        timestamp: new Date(),
        payload: { message: "test message" },
      };

      await customCollector.acceptEvent(testEvent);
      await customCollector.waitForActiveOperations();

      const stats = customCollector.getStats();
      expect(stats.failedEvents).toBe(1);
      // Should only retry once due to maxRetries: 1
      expect(stats.totalRetries).toBe(1);
    });
  });

  describe("event key generation", () => {
    it("should generate unique keys for different events", async () => {
      const event1: EventEnvelope = {
        session_id: "session-1",
        thread_id: "thread-1",
        user_id: "user-1",
        node: "identity",
        event_type: EventType.NODE_ENTERED,
        timestamp: new Date(),
        step_index: 1,
        payload: { message: "message 1" },
      };

      const event2: EventEnvelope = {
        session_id: "session-1",
        thread_id: "thread-1",
        user_id: "user-1",
        node: "identity",
        event_type: EventType.NODE_ENTERED,
        timestamp: new Date(),
        step_index: 2, // Different step index
        payload: { message: "message 2" },
      };

      await eventCollector.acceptEvent(event1);
      await eventCollector.acceptEvent(event2);
      await eventCollector.waitForActiveOperations();

      const stats = eventCollector.getStats();
      expect(stats.totalEvents).toBe(2);
      expect(stats.duplicateEvents).toBe(0);
      expect(stats.successfulEvents).toBe(2);
    });

    it("should handle events without step_index", async () => {
      const event: EventEnvelope = {
        session_id: "session-1",
        thread_id: "thread-1",
        user_id: "user-1",
        node: "identity",
        event_type: EventType.SESSION_STARTED,
        timestamp: new Date(),
        // No step_index
        payload: { message: "session started" },
      };

      await eventCollector.acceptEvent(event);
      await eventCollector.waitForActiveOperations();

      const stats = eventCollector.getStats();
      expect(stats.totalEvents).toBe(1);
      expect(stats.successfulEvents).toBe(1);
    });
  });

  describe("utility methods", () => {
    it("should clear processed events cache", async () => {
      const testEvent: EventEnvelope = {
        session_id: "test-session-1",
        thread_id: "test-thread-1",
        user_id: "test-user-1",
        node: "identity",
        event_type: EventType.NODE_ENTERED,
        timestamp: new Date(),
        payload: { message: "test message" },
      };

      await eventCollector.acceptEvent(testEvent);
      await eventCollector.waitForActiveOperations();

      // Send same event again - should be duplicate
      await eventCollector.acceptEvent(testEvent);
      await eventCollector.waitForActiveOperations();

      let stats = eventCollector.getStats();
      expect(stats.duplicateEvents).toBe(1);

      // Clear cache and send again - should not be duplicate
      eventCollector.clearProcessedEvents();
      await eventCollector.acceptEvent(testEvent);
      await eventCollector.waitForActiveOperations();

      stats = eventCollector.getStats();
      expect(stats.totalEvents).toBe(3);
      expect(stats.duplicateEvents).toBe(1); // Still 1, not 2
    });

    it("should track active operations count", async () => {
      expect(eventCollector.getActiveOperationsCount()).toBe(0);

      const testEvent: EventEnvelope = {
        session_id: "test-session-1",
        thread_id: "test-thread-1",
        user_id: "test-user-1",
        node: "identity",
        event_type: EventType.NODE_ENTERED,
        timestamp: new Date(),
        payload: { message: "test message" },
      };

      await eventCollector.acceptEvent(testEvent);
      expect(eventCollector.getActiveOperationsCount()).toBe(1);

      await eventCollector.waitForActiveOperations();
      expect(eventCollector.getActiveOperationsCount()).toBe(0);
    });
  });
});

describe("EventType enum", () => {
  it("should contain all expected event types", () => {
    const expectedTypes = [
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

    expectedTypes.forEach((type) => {
      expect(Object.values(EventType)).toContain(type);
    });
  });
});
