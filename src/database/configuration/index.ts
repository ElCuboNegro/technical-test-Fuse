// Configuration management for database connections and environment variables

import { 
  ConfigurationManager, 
  DatabaseConfiguration, 
  EnvironmentConfig, 
  ValidationResult, 
  HashingSalts 
} from '../interfaces';
import { DatabaseValidator } from '../seeding/validator';

export class DatabaseConfigurationManager implements ConfigurationManager {
  private config: DatabaseConfiguration;

  constructor() {
    this.config = this.loadConfiguration();
  }

  private loadConfiguration(): DatabaseConfiguration {
    return {
      testDatabaseUrl: process.env.TEST_DATABASE_URL,
      productionDatabaseUrl: process.env.DATABASE_URL || '',
      ssnSalt: process.env.SSN_SALT || '',
      dobSalt: process.env.DOB_SALT
    };
  }

  getDatabaseUrl(environment: 'test' | 'production'): string {
    if (environment === 'test') {
      return this.config.testDatabaseUrl || this.config.productionDatabaseUrl;
    }
    return this.config.productionDatabaseUrl;
  }

  validateEnvironmentVariables(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.config.productionDatabaseUrl) {
      errors.push('DATABASE_URL environment variable is required');
    }

    if (!this.config.ssnSalt) {
      errors.push('SSN_SALT environment variable is required');
    }

    if (!this.config.testDatabaseUrl) {
      warnings.push('TEST_DATABASE_URL not set, will use DATABASE_URL for test environment');
    }

    if (!this.config.dobSalt) {
      warnings.push('DOB_SALT not set, will use SSN_SALT for DOB hashing');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  getHashingSalts(): HashingSalts {
    return {
      ssnSalt: this.config.ssnSalt,
      dobSalt: this.config.dobSalt || this.config.ssnSalt
    };
  }

  isTestEnvironment(databaseUrl: string): boolean {
    // Check if the database URL contains test indicators
    const testIndicators = ['test', 'testing', 'dev', 'development'];
    const url = databaseUrl.toLowerCase();
    
    return testIndicators.some(indicator => 
      url.includes(`_${indicator}`) || 
      url.includes(`-${indicator}`) || 
      url.includes(`${indicator}_`) || 
      url.includes(`${indicator}-`)
    );
  }

  getEnvironmentConfig(environment: 'test' | 'production'): EnvironmentConfig {
    const databaseUrl = this.getDatabaseUrl(environment);
    
    return {
      environment,
      databaseUrl,
      isTestEnvironment: environment === 'test' || this.isTestEnvironment(databaseUrl)
    };
  }

  /**
   * Validate database connection for a specific environment
   */
  async validateDatabaseConnection(environment: 'test' | 'production'): Promise<boolean> {
    const databaseUrl = this.getDatabaseUrl(environment);
    const validator = new DatabaseValidator(databaseUrl);
    
    try {
      const isConnected = await validator.validateConnection(databaseUrl);
      const isValidEnvironment = await validator.validateEnvironment(environment);
      
      return isConnected && isValidEnvironment;
    } catch (error) {
      console.error(`Database connection validation failed for ${environment}:`, error.message);
      return false;
    } finally {
      await validator.close();
    }
  }

  /**
   * Get database connection info without exposing credentials
   */
  getDatabaseInfo(environment: 'test' | 'production'): { host: string; database: string; port: number } {
    const databaseUrl = this.getDatabaseUrl(environment);
    
    try {
      const url = new URL(databaseUrl);
      return {
        host: url.hostname,
        database: url.pathname.slice(1), // Remove leading slash
        port: parseInt(url.port) || 5432
      };
    } catch (error) {
      throw new Error(`Invalid database URL format for ${environment} environment`);
    }
  }
}

export { DatabaseConfigurationManager as ConfigurationManager };