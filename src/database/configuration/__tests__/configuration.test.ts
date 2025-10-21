// Tests for database configuration management

import { DatabaseConfigurationManager } from '../index';

describe('DatabaseConfigurationManager', () => {
  let configManager: DatabaseConfigurationManager;

  beforeEach(() => {
    configManager = new DatabaseConfigurationManager();
  });

  describe('getDatabaseUrl', () => {
    it('should return test database URL for test environment when available', () => {
      const testUrl = configManager.getDatabaseUrl('test');
      expect(testUrl).toBe(process.env.TEST_DATABASE_URL);
    });

    it('should return production database URL for production environment', () => {
      const prodUrl = configManager.getDatabaseUrl('production');
      expect(prodUrl).toBe(process.env.DATABASE_URL);
    });

    it('should fallback to production URL when test URL is not set', () => {
      const originalTestUrl = process.env.TEST_DATABASE_URL;
      delete process.env.TEST_DATABASE_URL;
      
      const newConfigManager = new DatabaseConfigurationManager();
      const testUrl = newConfigManager.getDatabaseUrl('test');
      
      expect(testUrl).toBe(process.env.DATABASE_URL);
      
      // Restore original value
      process.env.TEST_DATABASE_URL = originalTestUrl;
    });
  });

  describe('validateEnvironmentVariables', () => {
    it('should pass validation when all required variables are set', () => {
      const result = configManager.validateEnvironmentVariables();
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when DATABASE_URL is missing', () => {
      const originalUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;
      
      const newConfigManager = new DatabaseConfigurationManager();
      const result = newConfigManager.validateEnvironmentVariables();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('DATABASE_URL environment variable is required');
      
      // Restore original value
      process.env.DATABASE_URL = originalUrl;
    });

    it('should fail validation when SSN_SALT is missing', () => {
      const originalSalt = process.env.SSN_SALT;
      delete process.env.SSN_SALT;
      
      const newConfigManager = new DatabaseConfigurationManager();
      const result = newConfigManager.validateEnvironmentVariables();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('SSN_SALT environment variable is required');
      
      // Restore original value
      process.env.SSN_SALT = originalSalt;
    });

    it('should include warnings for optional variables', () => {
      const originalTestUrl = process.env.TEST_DATABASE_URL;
      const originalDobSalt = process.env.DOB_SALT;
      
      delete process.env.TEST_DATABASE_URL;
      delete process.env.DOB_SALT;
      
      const newConfigManager = new DatabaseConfigurationManager();
      const result = newConfigManager.validateEnvironmentVariables();
      
      expect(result.warnings).toContain('TEST_DATABASE_URL not set, will use DATABASE_URL for test environment');
      expect(result.warnings).toContain('DOB_SALT not set, will use SSN_SALT for DOB hashing');
      
      // Restore original values
      process.env.TEST_DATABASE_URL = originalTestUrl;
      process.env.DOB_SALT = originalDobSalt;
    });
  });

  describe('getHashingSalts', () => {
    it('should return both salts when DOB_SALT is set', () => {
      const salts = configManager.getHashingSalts();
      
      expect(salts.ssnSalt).toBe(process.env.SSN_SALT);
      expect(salts.dobSalt).toBe(process.env.DOB_SALT);
    });

    it('should use SSN_SALT for DOB when DOB_SALT is not set', () => {
      const originalDobSalt = process.env.DOB_SALT;
      delete process.env.DOB_SALT;
      
      const newConfigManager = new DatabaseConfigurationManager();
      const salts = newConfigManager.getHashingSalts();
      
      expect(salts.ssnSalt).toBe(process.env.SSN_SALT);
      expect(salts.dobSalt).toBe(process.env.SSN_SALT);
      
      // Restore original value
      process.env.DOB_SALT = originalDobSalt;
    });
  });

  describe('isTestEnvironment', () => {
    it('should identify test database URLs correctly', () => {
      const testUrls = [
        'postgresql://user:pass@localhost:5432/app_test',
        'postgresql://user:pass@localhost:5432/app-test',
        'postgresql://user:pass@localhost:5432/test_app',
        'postgresql://user:pass@localhost:5432/development_db',
        'postgresql://user:pass@localhost:5432/app_dev'
      ];

      testUrls.forEach(url => {
        expect(configManager.isTestEnvironment(url)).toBe(true);
      });
    });

    it('should identify production database URLs correctly', () => {
      const prodUrls = [
        'postgresql://user:pass@localhost:5432/app_prod',
        'postgresql://user:pass@localhost:5432/production',
        'postgresql://user:pass@localhost:5432/myapp'
      ];

      prodUrls.forEach(url => {
        expect(configManager.isTestEnvironment(url)).toBe(false);
      });
    });
  });

  describe('getEnvironmentConfig', () => {
    it('should return correct config for test environment', () => {
      const config = configManager.getEnvironmentConfig('test');
      
      expect(config.environment).toBe('test');
      expect(config.databaseUrl).toBe(process.env.TEST_DATABASE_URL);
      expect(config.isTestEnvironment).toBe(true);
    });

    it('should return correct config for production environment', () => {
      const config = configManager.getEnvironmentConfig('production');
      
      expect(config.environment).toBe('production');
      expect(config.databaseUrl).toBe(process.env.DATABASE_URL);
      expect(config.isTestEnvironment).toBe(false);
    });
  });

  describe('getDatabaseInfo', () => {
    it('should parse database URL correctly', () => {
      const info = configManager.getDatabaseInfo('test');
      
      expect(info.host).toBe('localhost');
      expect(info.port).toBe(5433);
      expect(info.database).toBe('agents_app_test');
    });

    it('should handle URLs without explicit port', () => {
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost/mydb';
      
      const newConfigManager = new DatabaseConfigurationManager();
      const info = newConfigManager.getDatabaseInfo('production');
      
      expect(info.host).toBe('localhost');
      expect(info.port).toBe(5432); // Default PostgreSQL port
      expect(info.database).toBe('mydb');
      
      // Restore original value
      process.env.DATABASE_URL = originalUrl;
    });

    it('should throw error for invalid URL format', () => {
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'invalid-url';
      
      const newConfigManager = new DatabaseConfigurationManager();
      
      expect(() => {
        newConfigManager.getDatabaseInfo('production');
      }).toThrow('Invalid database URL format for production environment');
      
      // Restore original value
      process.env.DATABASE_URL = originalUrl;
    });
  });
});