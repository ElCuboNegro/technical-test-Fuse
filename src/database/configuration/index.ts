/**
 * Database Configuration Management Module
 * 
 * This module provides comprehensive database configuration management
 * for the seeding system, including environment detection, validation,
 * and secure configuration handling.
 * 
 * Requirements addressed:
 * - 6.1: Support TEST_DATABASE_URL and DATABASE_URL environment variables
 * - 6.2: Fall back to DATABASE_URL when TEST_DATABASE_URL is not set  
 * - 6.3: Validate database environment before operations
 * - 6.5: Provide clear logging of database environment usage
 */

export { ConfigurationManager } from './manager';
export { 
  detectEnvironment,
  validateEnvironmentSafety,
  getValidatedEnvironmentConfig,
  type EnvironmentDetectionResult
} from './environment';

// Re-export interfaces for convenience
export type {
  ConfigurationManager as IConfigurationManager,
  DatabaseConfiguration,
  EnvironmentConfig,
  ValidationResult,
  HashingSalts
} from '../interfaces/index';