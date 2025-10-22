/**
 * Conversation Logging and Pseudonymization System
 * 
 * This module provides core data structures and interfaces for a passive
 * conversation logging system that operates within the Voice Verification Agent
 * ecosystem. All persistent data is structurally guaranteed to be pseudonymized
 * and compliant with privacy regulations (GDPR/CCPA).
 * 
 * Requirements: 8.1, 8.2
 */

// Export all interfaces
export * from './interfaces';

// Export engine implementations
export * from './engines/pseudonymization-engine';