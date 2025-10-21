import { ConfigurationManager } from '../manager';

describe('ConfigurationManager', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('getDatabaseUrl', () => {
    it('should return TEST_DATABASE_URL for test environment when available', () => {
      process.env.TEST_DATABASE_URL = 'postgresql://test:test@localhost:5433/test_db';
      process.env.DATABASE_URL = 'postgresql://prod:prod@localhost:5432/prod_db';
      process.env.SSN_SALT = 'test-salt';

      const manager = new ConfigurationManager();
      const url = manager.getDatabaseUrl('test');

      expect(url).toBe('postgresql://test:test@localhost:5433/test_db');
    });

    it('should fallback to DATABASE_URL for test environment when TEST_DATABASE_URL not set', () => {
      delete process.env.TEST_DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://prod:prod@localhost:5432/prod_db';
      process.env.SSN_SALT = 'test-salt';

      const manager = new ConfigurationManager();
      const url = manager.getDatabaseUrl('test');

      expect(url).toBe('postgresql://prod:prod@localhost:5432/prod_db');
    });

    it('should return DATABASE_URL for production environment', () => {
      process.env.DATABASE_URL = 'postgresql://prod:prod@localhost:5432/prod_db';
      process.env.SSN_SALT = 'test-salt';

      const manager = new ConfigurationManager();
      const url = manager.getDatabaseUrl('production');

      expect(url).toBe('postgresql://prod:prod@localhost:5432/prod_db');
    });

    it('should throw error when no database URL available for test environment', () => {
      delete process.env.TEST_DATABASE_URL;
      delete process.env.DATABASE_URL;
      process.env.SSN_SALT = 'test-salt';

      expect(() => new ConfigurationManager()).toThrow('DATABASE_URL environment variable is required');
    });

    it('should throw error when DATABASE_URL not set for production environment', () => {
      delete process.env.DATABASE_URL;
      process.env.SSN_SALT = 'test-salt';

      expect(() => new ConfigurationManager()).toThrow('DATABASE_URL environment variable is required');
    });
  });

  describe('validateEnvironmentVariables', () => {
    it('should return valid when all required variables are set', () => {
      process.env.DATABASE_URL = 'postgresql://prod:prod@localhost:5432/prod_db';
      process.env.TEST_DATABASE_URL = 'postgresql://test:test@localhost:5433/test_db';
      process.env.SSN_SALT = 'test-salt';
      process.env.DOB_SALT = 'dob-salt';

      const manager = new ConfigurationManager();
      const result = manager.validateEnvironmentVariables();

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors when required variables are missing', () => {
      delete process.env.DATABASE_URL;
      delete process.env.SSN_SALT;

      expect(() => new ConfigurationManager()).toThrow();
    });

    it('should return warnings when optional variables are missing', () => {
      process.env.DATABASE_URL = 'postgresql://prod:prod@localhost:5432/prod_db';
      process.env.SSN_SALT = 'test-salt';
      delete process.env.TEST_DATABASE_URL;
      delete process.env.DOB_SALT;

      const manager = new ConfigurationManager();
      const result = manager.validateEnvironmentVariables();

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('TEST_DATABASE_URL not set, will use DATABASE_URL for test environment');
      expect(result.warnings).toContain('DOB_SALT not set, will use SSN_SALT for DOB hashing');
    });
  });

  describe('getHashingSalts', () => {
    it('should return both salts when both are set', () => {
      process.env.DATABASE_URL = 'postgresql://prod:prod@localhost:5432/prod_db';
      process.env.SSN_SALT = 'ssn-salt';
      process.env.DOB_SALT = 'dob-salt';

      const manager = new ConfigurationManager();
      const salts = manager.getHashingSalts();

      expect(salts.ssnSalt).toBe('ssn-salt');
      expect(salts.dobSalt).toBe('dob-salt');
    });

    it('should use SSN_SALT for DOB when DOB_SALT not set', () => {
      process.env.DATABASE_URL = 'postgresql://prod:prod@localhost:5432/prod_db';
      process.env.SSN_SALT = 'ssn-salt';
      delete process.env.DOB_SALT;

      const manager = new ConfigurationManager();
      const salts = manager.getHashingSalts();

      expect(salts.ssnSalt).toBe('ssn-salt');
      expect(salts.dobSalt).toBe('ssn-salt');
    });
  });

  describe('isTestEnvironment', () => {
    beforeEach(() => {
      process.env.DATABASE_URL = 'postgresql://prod:prod@localhost:5432/prod_db';
      process.env.SSN_SALT = 'test-salt';
    });

    it('should detect test environment from URL patterns', () => {
      const manager = new ConfigurationManager();

      expect(manager.isTestEnvironment('postgresql://user:pass@localhost:5433/app_test')).toBe(true);
      expect(manager.isTestEnvironment('postgresql://user:pass@localhost:5433/test_app')).toBe(true);
      expect(manager.isTestEnvironment('postgresql://user:pass@localhost:5433/testing')).toBe(true);
      expect(manager.isTestEnvironment('postgresql://user:pass@127.0.0.1:5433/app')).toBe(true);
    });

    it('should not detect test environment for production URLs', () => {
      const manager = new ConfigurationManager();

      expect(manager.isTestEnvironment('postgresql://user:pass@prod.example.com:5432/app')).toBe(false);
      expect(manager.isTestEnvironment('postgresql://user:pass@localhost:5432/app')).toBe(false);
    });
  });

  describe('getEnvironmentConfig', () => {
    it('should return complete environment configuration', () => {
      process.env.DATABASE_URL = 'postgresql://prod:prod@localhost:5432/prod_db';
      process.env.TEST_DATABASE_URL = 'postgresql://test:test@localhost:5433/test_db';
      process.env.SSN_SALT = 'test-salt';

      // Mock console.log to avoid output during tests
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const manager = new ConfigurationManager();
      const config = manager.getEnvironmentConfig('test');

      expect(config.environment).toBe('test');
      expect(config.databaseUrl).toBe('postgresql://test:test@localhost:5433/test_db');
      expect(config.isTestEnvironment).toBe(true);

      // Verify logging occurred
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Database Configuration:'));

      consoleSpy.mockRestore();
    });
  });
});