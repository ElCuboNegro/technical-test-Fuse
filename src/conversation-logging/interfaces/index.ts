/**
 * Core interfaces for conversation logging and pseudonymization system
 * Requirements: 8.1, 8.2
 */

// Event envelope and types
export * from './event-envelope';

// Pseudonymization engine interfaces
export * from './pseudonymization-engine';

// Conversation logger interface
export * from './conversation-logger';

// Redis event queue interface
export * from './redis-event-queue';

// Storage adapter interface
export * from './storage-adapter';

// Compliance engine interface
export * from './compliance-engine';