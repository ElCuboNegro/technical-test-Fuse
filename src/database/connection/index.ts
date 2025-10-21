/**
 * Database Connection Management Module
 * 
 * This module provides database connection pooling, lifecycle management,
 * and health monitoring for the seeding system.
 * 
 * Requirements addressed:
 * - 6.1: Support environment-specific database URL resolution
 * - 6.2: Connection validation and error handling
 * - 6.3: Database connection pooling and lifecycle management
 */

export { DatabaseManager, type PoolStatistics, type DatabaseManagerConfig } from './database-manager';

// Re-export for convenience
export type { 
  ConfigurationManager,
  EnvironmentConfig 
} from '../interfaces/index';