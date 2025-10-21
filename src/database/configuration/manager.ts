import { 
  ConfigurationManager as IConfigurationManager,
  DatabaseConfiguration,
  EnvironmentConfig,
  ValidationResult,
  HashingSalts
} from '../interfaces/index';

/**
 * ConfigurationManager handles environment-specific database configurations
 * and provides secure access to database URLs and hashing salts.
 * 
 * Requirements addressed:
 * - 6.1: Support TEST_DATABASE_URL and DATABASE_URL environment variables
 * - 6.2: Fall back to DATABASE_URL when TEST_DATABASE_URL is not set
 * - 6.3: Validate database environment before operations
 * - 6.5: Provide clear logging of database environment usage
 */
export class ConfigurationManager implements IConfigurationManager {
  private readonly config: DatabaseConfiguration;

  constructor() {
    this.config = this.loadConfiguration();
    this.validateConfiguration();
  }

  /**
   * Get database URL for specified environment
   * Requirements: 6.1, 6.2
   */
  getDatabaseUrl(environment: 'test' | 'production'): string {
    if (environment === 'test') {
      // Use TEST_DATABASE_URL if available, fallback to DATABASE_URL
      const testUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
      if (!testUrl) {
        throw new Error('No database URL configured for test environment. Set TEST_DATABASE_URL or DATABASE_URL.');
      }
      return testUrl;
    }

    // Production environment
    const prodUrl = process.env.DATABASE_URL;
    if (!prodUrl) {
      throw new Error('DATABASE_URL environment variable is required for production environment.');
    }
    return prodUrl;
  }

  /**
   * Validate all required environment variables are present
   * Requirements: 6.1, 6.2
   */
  validateEnvironmentVariables(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check DATABASE_URL (required)
    if (!process.env.DATABASE_URL) {
      errors.push('DATABASE_URL environment variable is required');
    }

    // Check TEST_DATABASE_URL (optional, but recommended)
    if (!process.env.TEST_DATABASE_URL) {
      warnings.push('TEST_DATABASE_URL not set, will use DATABASE_URL for test environment');
    }

    // Check hashing salts (required for security)
    if (!process.env.SSN_SALT) {
      errors.push('SSN_SALT environment variable is required for secure hashing');
    }

    // DOB_SALT is optional, will use SSN_SALT as fallback
    if (!process.env.DOB_SALT) {
      warnings.push('DOB_SALT not set, will use SSN_SALT for DOB hashing');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get hashing salts for secure PII processing
   * Requirements: 6.1
   */
  getHashingSalts(): HashingSalts {
    const ssnSalt = process.env.SSN_SALT;
    if (!ssnSalt) {
      throw new Error('SSN_SALT environment variable is required');
    }

    return {
      ssnSalt,
      dobSalt: process.env.DOB_SALT || ssnSalt // Fallback to SSN_SALT if DOB_SALT not set
    };
  }

  /**
   * Determine if a database URL points to a test environment
   * Requirements: 6.3
   */
  isTestEnvironment(databaseUrl: string): boolean {
    // Check if URL contains test indicators
    const testIndicators = [
      '_test',
      'test_',
      'testing',
      ':5433', // Common test port
      'localhost:5433',
      '127.0.0.1:5433'
    ];

    const urlLower = databaseUrl.toLowerCase();
    return testIndicators.some(indicator => urlLower.includes(indicator));
  }

  /**
   * Get complete environment configuration
   * Requirements: 6.3, 6.5
   */
  getEnvironmentConfig(environment: 'test' | 'production'): EnvironmentConfig {
    const databaseUrl = this.getDatabaseUrl(environment);
    const isTestEnv = this.isTestEnvironment(databaseUrl);

    // Log environment usage for transparency (Requirement 6.5)
    console.log(`Database Configuration:
  Environment: ${environment}
  Database URL: ${this.maskDatabaseUrl(databaseUrl)}
  Detected as test environment: ${isTestEnv}
  Using TEST_DATABASE_URL: ${environment === 'test' && !!process.env.TEST_DATABASE_URL}`);

    return {
      environment,
      databaseUrl,
      isTestEnvironment: isTestEnv
    };
  }

  /**
   * Load configuration from environment variables
   */
  private loadConfiguration(): DatabaseConfiguration {
    return {
      testDatabaseUrl: process.env.TEST_DATABASE_URL,
      productionDatabaseUrl: process.env.DATABASE_URL || '',
      ssnSalt: process.env.SSN_SALT || '',
      dobSalt: process.env.DOB_SALT
    };
  }

  /**
   * Validate loaded configuration
   */
  private validateConfiguration(): void {
    const validation = this.validateEnvironmentVariables();
    
    if (!validation.isValid) {
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }

    // Log warnings if any
    if (validation.warnings && validation.warnings.length > 0) {
      console.warn('Configuration warnings:', validation.warnings.join(', '));
    }
  }

  /**
   * Mask sensitive parts of database URL for logging
   * Requirements: 6.5 (secure logging)
   */
  private maskDatabaseUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const maskedPassword = urlObj.password ? '***' : '';
      return `${urlObj.protocol}//${urlObj.username}:${maskedPassword}@${urlObj.host}${urlObj.pathname}`;
    } catch {
      // If URL parsing fails, just mask the middle part
      const parts = url.split('@');
      if (parts.length > 1) {
        const beforeAt = parts[0].split(':');
        if (beforeAt.length > 2) {
          beforeAt[2] = '***';
        }
        return `${beforeAt.join(':')}@${parts.slice(1).join('@')}`;
      }
      return url.replace(/:[^:@]+@/, ':***@');
    }
  }
}