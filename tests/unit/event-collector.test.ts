/**
 * Unit tests for EventCollector
 * Tests non-blocking event acceptance, duplicate detection, retry logic, and ensures collector never blocks calling code
 * Requirements: 2.1, 2.4, 5.4, 5.5
 */

import {
  EventCollector,
  DEFAULT_EVENT_COLLECTOR_CONFIG,
} from "../../src/conversation-logging/collectors/event-collector";
import {
  EventEnvelope,
  EventType,
} from "../../src/conversation-logging/interfaces/event-envelope";
import {
  RedisEventQueue,
  RedisQueueStats,
} from "../../src/conversation-logging/interfaces/redis-event-queue";
import {
  PseudonymizationEngine,
  PseudonymizationResult,
  EmailPseudonymizationResult,
} from "../../src/conversation-logging/interfaces/pseudonymization-engine";

// Mock implementations
class MockRedisEventQueue implements RedisEventQueue {
  private queue: EventEnvelope[] = [];
  private shouldFail = false;
  private failureCount = 0;
  private maxFailures = 0;

  async enqueue(event: EventEnvelope): Promise<void> {
    if (this.shouldFail && this.failureCount < this.maxFailures) {
      this.failureCount++;
      throw new Error("Redis enqueue failed");
    }
    this.queue.push(event);
  }

  async dequeue(): Promise<EventEnvelope | null> {
    return this.queue.shift() || null;
  }

  async getQueueLength(): Promise<number> {
    return this.queue.length;
  }

  async applyBackpressure(): Promise<boolean> {
    return false;
  }

  async flush(): Promise<EventEnvelope[]> {
    const events = [...this.queue];
    this.queue = [];
    return events;
  }

  async getStats(): Promise<RedisQueueStats> {
    return {
      currentQueueLength: this.queue.length,
      maxQueueLength: 1000,
      utilizationPercent: 0,
      totalEnqueued: 0,
      totalDequeued: 0,
      droppedEvents: 0,
      backpressureActive: false,
      connectionStatus: "connected" as const,
      operationErrors: 0,
    };
  }

  async clear(): Promise<void> {
    this.queue = [];
  }

  async isEmpty(): Promise<boolean> {
    return this.queue.length === 0;
  }

  setBackpressureThreshold(): void {}
  async handleConnectionFailure(): Promise<void> {}
  async restoreConnection(): Promise<void> {}
  async getConnectionHealth() {
    return {
      status: "healthy" as const,
      reconnectAttempts: 0,
    };
  }

  // Test helpers
  setFailureMode(shouldFail: boolean, maxFailures = 1): void {
    this.shouldFail = shouldFail;
    this.maxFailures = maxFailures;
    this.failureCount = 0;
  }

  getEnqueuedEvents(): EventEnvelope[] {
    return [...this.queue];
  }
}

class MockPseudonymizationEngine implements PseudonymizationEngine {
  private shouldFail = false;

  async pseudonymizePayload(
    payload: Record<string, any>,
  ): Promise<Record<string, any>> {
    if (this.shouldFail) {
      throw new Error("Pseudonymization failed");
    }
    return { ...payload, pseudonymized: true };
  }

  async generateUserPseudonym(): Promise<string> {
    return "pseudo_user_123";
  }

  handleFailure(): string {
    return "[REDACTED]";
  }

  async maskSSN(): Promise<PseudonymizationResult> {
    return { masked: "****", hash: "hash123" };
  }

  async maskDOB(): Promise<PseudonymizationResult> {
    return { masked: "****-**-**", hash: "hash456" };
  }

  async maskEmail(): Promise<EmailPseudonymizationResult> {
    return { masked: "****@****.***", hash: "email_hash123" };
  }

  async bucketIncome(): Promise<string> {
    return "$50K-$75K";
  }

  async rotateSalts(): Promise<void> {}

  // Test helper
  setFailureMode(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }
}

describe("EventCollector", () => {
  let eventCollector: EventCollector;
  let mockQueue: MockRedisEventQueue;
  let mockEngine: MockPseudonymizationEngine;

  beforeEach(() => {
    mockQueue = new MockRedisEventQueue();
    mockEngine = new MockPseudonymizationEngine();
    eventCollector = new EventCollector(mockQueue, mockEngine, {
      ...DEFAULT_EVENT_COLLECTOR_CONFIG,
      operationTimeout: 100, // Shorter timeout for tests
      initialRetryDelay: 10,
      maxRetryDelay: 50,
    });
  });

  afterEach(async () => {
    // Wait for any active operations to complete
    await eventCollector.waitForActiveOperations();
    eventCollector.clearProcessedEvents();
  });

  describe("Non-blocking event acceptance", () => {
    it("should accept events for all EventType values without blocking", async () => {
      const eventTypes = Object.values(EventType);
      const startTime = Date.now();

      // Create events for all types
      const events = eventTypes.map((eventType, index) => ({
        session_id: "session_1",
        thread_id: "thread_1",
        user_id: "user_1",
        node: "test_node",
        event_type: eventType,
        timestamp: new Date(),
        step_index: index,
        payload: { data: `test_${eventType}` },
      }));

      // Accept all events - should return immediately
      const acceptPromises = events.map((event) =>
        eventCollector.acceptEvent(event),
      );
      await Promise.all(acceptPromises);

      const acceptTime = Date.now() - startTime;

      // Should complete quickly (non-blocking)
      expect(acceptTime).toBeLessThan(50);

      // Wait for background processing to complete
      await eventCollector.waitForActiveOperations();

      // All events should be processed
      const stats = eventCollector.getStats();
      expect(stats.totalEvents).toBe(eventTypes.length);
      expect(stats.successfulEvents).toBe(eventTypes.length);

      // All events should be enqueued
      const enqueuedEvents = mockQueue.getEnqueuedEvents();
      expect(enqueuedEvents).toHaveLength(eventTypes.length);

      // Events should be pseudonymized
      enqueuedEvents.forEach((event) => {
        expect(event.payload.pseudonymized).toBe(true);
      });
    });

    it("should never block calling code even when processing fails", async () => {
      // Make pseudonymization fail
      mockEngine.setFailureMode(true);

      const event: EventEnvelope = {
        session_id: "session_1",
        thread_id: "thread_1",
        user_id: "user_1",
        node: "test_node",
        event_type: EventType.MESSAGE_USER,
        timestamp: new Date(),
        step_index: 1,
        payload: { data: "test" },
      };

      const startTime = Date.now();

      // Should not throw and should return quickly
      await expect(eventCollector.acceptEvent(event)).resolves.not.toThrow();

      const acceptTime = Date.now() - startTime;
      expect(acceptTime).toBeLessThan(50);

      // Wait for background processing
      await eventCollector.waitForActiveOperations();

      // Event should be marked as failed
      const stats = eventCollector.getStats();
      expect(stats.totalEvents).toBe(1);
      expect(stats.failedEvents).toBe(1);
    });

    it("should reject invalid event types", async () => {
      const invalidEvent = {
        session_id: "session_1",
        thread_id: "thread_1",
        user_id: "user_1",
        node: "test_node",
        event_type: "INVALID_TYPE" as EventType,
        timestamp: new Date(),
        payload: { data: "test" },
      };

      await eventCollector.acceptEvent(invalidEvent);
      await eventCollector.waitForActiveOperations();

      const stats = eventCollector.getStats();
      expect(stats.failedEvents).toBe(1);
    });
  });

  describe("Duplicate event detection and handling", () => {
    it("should detect and ignore duplicate events", async () => {
      const event: EventEnvelope = {
        session_id: "session_1",
        thread_id: "thread_1",
        user_id: "user_1",
        node: "test_node",
        event_type: EventType.MESSAGE_USER,
        timestamp: new Date(),
        step_index: 1,
        payload: { data: "test" },
      };

      // Submit same event twice
      await eventCollector.acceptEvent(event);
      await eventCollector.acceptEvent(event);

      await eventCollector.waitForActiveOperations();

      const stats = eventCollector.getStats();
      expect(stats.totalEvents).toBe(2); // Both events counted
      expect(stats.duplicateEvents).toBe(1); // One marked as duplicate
      expect(stats.successfulEvents).toBe(1); // Only one processed

      // Only one event should be enqueued
      const enqueuedEvents = mockQueue.getEnqueuedEvents();
      expect(enqueuedEvents).toHaveLength(1);
    });

    it("should use session_id, thread_id, step_index, and event_type for duplicate detection", async () => {
      const baseEvent = {
        session_id: "session_1",
        thread_id: "thread_1",
        user_id: "user_1",
        node: "test_node",
        event_type: EventType.MESSAGE_USER,
        timestamp: new Date(),
        step_index: 1,
        payload: { data: "test" },
      };

      // Different session_id - should not be duplicate
      await eventCollector.acceptEvent(baseEvent);
      await eventCollector.acceptEvent({
        ...baseEvent,
        session_id: "session_2",
      });

      // Different thread_id - should not be duplicate
      await eventCollector.acceptEvent({ ...baseEvent, thread_id: "thread_2" });

      // Different step_index - should not be duplicate
      await eventCollector.acceptEvent({ ...baseEvent, step_index: 2 });

      // Different event_type - should not be duplicate
      await eventCollector.acceptEvent({
        ...baseEvent,
        event_type: EventType.MESSAGE_AGENT,
      });

      // Same key - should be duplicate
      await eventCollector.acceptEvent(baseEvent);

      await eventCollector.waitForActiveOperations();

      const stats = eventCollector.getStats();
      expect(stats.totalEvents).toBe(6);
      expect(stats.duplicateEvents).toBe(1);
      expect(stats.successfulEvents).toBe(5);
    });

    it("should handle events without step_index", async () => {
      const event1: EventEnvelope = {
        session_id: "session_1",
        thread_id: "thread_1",
        user_id: "user_1",
        node: "test_node",
        event_type: EventType.SESSION_STARTED,
        timestamp: new Date(),
        payload: { data: "test" },
      };

      const event2 = { ...event1 }; // Same event without step_index

      await eventCollector.acceptEvent(event1);
      await eventCollector.acceptEvent(event2);

      await eventCollector.waitForActiveOperations();

      const stats = eventCollector.getStats();
      expect(stats.duplicateEvents).toBe(1);
    });
  });

  describe("Retry logic with exponential backoff", () => {
    it("should retry failed operations with exponential backoff", async () => {
      // Make queue fail for first 2 attempts, then succeed
      mockQueue.setFailureMode(true, 2);

      const event: EventEnvelope = {
        session_id: "session_1",
        thread_id: "thread_1",
        user_id: "user_1",
        node: "test_node",
        event_type: EventType.MESSAGE_USER,
        timestamp: new Date(),
        step_index: 1,
        payload: { data: "test" },
      };

      const startTime = Date.now();
      await eventCollector.acceptEvent(event);
      await eventCollector.waitForActiveOperations();

      const processingTime = Date.now() - startTime;

      // Should take time due to retries with backoff
      expect(processingTime).toBeGreaterThan(20); // At least 2 retry delays

      const stats = eventCollector.getStats();
      expect(stats.successfulEvents).toBe(1);
      expect(stats.totalRetries).toBe(2);

      // Event should eventually be enqueued
      const enqueuedEvents = mockQueue.getEnqueuedEvents();
      expect(enqueuedEvents).toHaveLength(1);
    });

    it("should fail after maximum retry attempts", async () => {
      // Make queue always fail
      mockQueue.setFailureMode(true, 10);

      const event: EventEnvelope = {
        session_id: "session_1",
        thread_id: "thread_1",
        user_id: "user_1",
        node: "test_node",
        event_type: EventType.MESSAGE_USER,
        timestamp: new Date(),
        step_index: 1,
        payload: { data: "test" },
      };

      await eventCollector.acceptEvent(event);
      await eventCollector.waitForActiveOperations();

      const stats = eventCollector.getStats();
      expect(stats.failedEvents).toBe(1);
      expect(stats.totalRetries).toBe(3); // maxRetries from config

      // No events should be enqueued
      const enqueuedEvents = mockQueue.getEnqueuedEvents();
      expect(enqueuedEvents).toHaveLength(0);
    });

    it("should implement exponential backoff delays", async () => {
      const collector = new EventCollector(mockQueue, mockEngine, {
        maxRetries: 3,
        initialRetryDelay: 10,
        backoffMultiplier: 2,
        maxRetryDelay: 100,
        operationTimeout: 50,
      });

      // Make queue always fail
      mockQueue.setFailureMode(true, 10);

      const event: EventEnvelope = {
        session_id: "session_1",
        thread_id: "thread_1",
        user_id: "user_1",
        node: "test_node",
        event_type: EventType.MESSAGE_USER,
        timestamp: new Date(),
        step_index: 1,
        payload: { data: "test" },
      };

      const startTime = Date.now();
      await collector.acceptEvent(event);
      await collector.waitForActiveOperations();
      const totalTime = Date.now() - startTime;

      // Should take at least: 10ms + 20ms + 40ms = 70ms for retries
      expect(totalTime).toBeGreaterThan(60);

      const stats = collector.getStats();
      expect(stats.totalRetries).toBe(3);
    });

    it("should respect maximum retry delay", async () => {
      const collector = new EventCollector(mockQueue, mockEngine, {
        maxRetries: 2,
        initialRetryDelay: 100,
        backoffMultiplier: 10,
        maxRetryDelay: 50, // Lower than calculated delay
        operationTimeout: 200,
      });

      mockQueue.setFailureMode(true, 10);

      const event: EventEnvelope = {
        session_id: "session_1",
        thread_id: "thread_1",
        user_id: "user_1",
        node: "test_node",
        event_type: EventType.MESSAGE_USER,
        timestamp: new Date(),
        step_index: 1,
        payload: { data: "test" },
      };

      const startTime = Date.now();
      await collector.acceptEvent(event);
      await collector.waitForActiveOperations();
      const totalTime = Date.now() - startTime;

      // Should be capped by maxRetryDelay (50ms * 2 retries = 100ms)
      expect(totalTime).toBeLessThan(150);
      expect(totalTime).toBeGreaterThan(90);
    });
  });

  describe("Operation timeout handling", () => {
    it("should timeout long-running operations", async () => {
      // Create a mock that hangs
      const hangingQueue = {
        ...mockQueue,
        enqueue: () => new Promise(() => {}), // Never resolves
      } as unknown as RedisEventQueue;

      const collector = new EventCollector(hangingQueue, mockEngine, {
        ...DEFAULT_EVENT_COLLECTOR_CONFIG,
        operationTimeout: 50,
        maxRetries: 1,
        initialRetryDelay: 10,
      });

      const event: EventEnvelope = {
        session_id: "session_1",
        thread_id: "thread_1",
        user_id: "user_1",
        node: "test_node",
        event_type: EventType.MESSAGE_USER,
        timestamp: new Date(),
        step_index: 1,
        payload: { data: "test" },
      };

      const startTime = Date.now();
      await collector.acceptEvent(event);
      await collector.waitForActiveOperations();
      const totalTime = Date.now() - startTime;

      // Should timeout and retry, then fail
      expect(totalTime).toBeGreaterThan(100); // 2 timeouts + retry delay
      expect(totalTime).toBeLessThan(300); // Allow more time for CI

      const stats = collector.getStats();
      expect(stats.failedEvents).toBe(1);
    });
  });

  describe("Statistics and monitoring", () => {
    it("should track comprehensive statistics", async () => {
      const events = [
        {
          session_id: "session_1",
          thread_id: "thread_1",
          user_id: "user_1",
          node: "test_node",
          event_type: EventType.MESSAGE_USER,
          timestamp: new Date(),
          step_index: 1,
          payload: { data: "test1" },
        },
        {
          session_id: "session_1",
          thread_id: "thread_1",
          user_id: "user_1",
          node: "test_node",
          event_type: EventType.MESSAGE_USER,
          timestamp: new Date(),
          step_index: 1, // Duplicate
          payload: { data: "test1" },
        },
        {
          session_id: "session_1",
          thread_id: "thread_1",
          user_id: "user_1",
          node: "test_node",
          event_type: EventType.MESSAGE_AGENT,
          timestamp: new Date(),
          step_index: 2, // Different step - not duplicate
          payload: { data: "test2" },
        },
      ];

      await eventCollector.acceptEvent(events[0]); // Should succeed
      await eventCollector.acceptEvent(events[1]); // Duplicate - should be ignored
      await eventCollector.acceptEvent(events[2]); // Should succeed

      await eventCollector.waitForActiveOperations();

      const stats = eventCollector.getStats();
      expect(stats.totalEvents).toBe(3);
      expect(stats.successfulEvents).toBe(2);
      expect(stats.failedEvents).toBe(0);
      expect(stats.duplicateEvents).toBe(1);
      expect(stats.avgProcessingTime).toBeGreaterThanOrEqual(0);
    });

    it("should track active operations count", async () => {
      // Create a slow operation
      const slowQueue = {
        ...mockQueue,
        enqueue: (event: EventEnvelope) =>
          new Promise((resolve) =>
            setTimeout(() => {
              mockQueue.enqueue(event);
              resolve();
            }, 50),
          ),
      } as RedisEventQueue;

      const collector = new EventCollector(slowQueue, mockEngine);

      const event: EventEnvelope = {
        session_id: "session_1",
        thread_id: "thread_1",
        user_id: "user_1",
        node: "test_node",
        event_type: EventType.MESSAGE_USER,
        timestamp: new Date(),
        step_index: 1,
        payload: { data: "test" },
      };

      // Start processing
      await collector.acceptEvent(event);

      // Should have active operation
      expect(collector.getActiveOperationsCount()).toBe(1);

      // Wait for completion
      await collector.waitForActiveOperations();

      // Should have no active operations
      expect(collector.getActiveOperationsCount()).toBe(0);
    });
  });

  describe("Error handling and resilience", () => {
    it("should handle pseudonymization failures gracefully", async () => {
      mockEngine.setFailureMode(true);

      const event: EventEnvelope = {
        session_id: "session_1",
        thread_id: "thread_1",
        user_id: "user_1",
        node: "test_node",
        event_type: EventType.MESSAGE_USER,
        timestamp: new Date(),
        step_index: 1,
        payload: { data: "test" },
      };

      // Should not throw
      await expect(eventCollector.acceptEvent(event)).resolves.not.toThrow();

      await eventCollector.waitForActiveOperations();

      const stats = eventCollector.getStats();
      expect(stats.failedEvents).toBe(1);
    });

    it("should continue processing other events when one fails", async () => {
      const events = [
        {
          session_id: "session_1",
          thread_id: "thread_1",
          user_id: "user_1",
          node: "test_node",
          event_type: EventType.MESSAGE_USER,
          timestamp: new Date(),
          step_index: 1,
          payload: { data: "test1" },
        },
        {
          session_id: "session_1",
          thread_id: "thread_1",
          user_id: "user_1",
          node: "test_node",
          event_type: EventType.MESSAGE_AGENT,
          timestamp: new Date(),
          step_index: 2,
          payload: { data: "test2" },
        },
      ];

      // Make first event fail by making pseudonymization fail for specific payload
      const originalPseudonymize =
        mockEngine.pseudonymizePayload.bind(mockEngine);
      mockEngine.pseudonymizePayload = async (payload: Record<string, any>) => {
        if (payload.data === "test1") {
          throw new Error("First event fails");
        }
        return originalPseudonymize(payload);
      };

      await Promise.all(
        events.map((event) => eventCollector.acceptEvent(event)),
      );
      await eventCollector.waitForActiveOperations();

      const stats = eventCollector.getStats();
      expect(stats.totalEvents).toBe(2);
      expect(stats.successfulEvents).toBe(1);
      expect(stats.failedEvents).toBe(1);

      // One event should be enqueued
      const enqueuedEvents = mockQueue.getEnqueuedEvents();
      expect(enqueuedEvents).toHaveLength(1);
      expect(enqueuedEvents[0].payload.data).toBe("test2");
    });
  });
});
