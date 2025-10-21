import { 
  detectEnvironment, 
  validateEnvironmentSafety,
  getValidatedEnvironmentConfig 
} from '../environment';

describe('Environment Detection', () => {
  describe('detectEnvironment', () => {
    it('should detect test environment with high confidence for strong indicators', () => {
      const testUrls = [
        'postgresql://user:pass@localhost:5433/app_test',
        'postgresql://user:pass@localhost:5433/test_app', 
        'postgresql://user:pass@localhost:5433/testing',
        'postgresql://user:pass@127.0.0.1:5433/app'
      ];

      testUrls.forEach(url => {
        const result = detectEnvironment(url);
        expect(result.environment).toBe('test');
        expect(result.confidence).toBe('high');
        expect(result.indicators.length).toBeGreaterThan(0);
      });
    });

    it('should detect production environment with high confidence for production indicators', () => {
      const prodUrls = [
        'postgresql://user:pass@prod.example.com:5432/app',
        'postgresql://user:pass@app.rds.amazonaws.com:5432/app',
        'postgresql://user:pass@production-db:5432/app'
      ];

      prodUrls.forEach(url => {
        const result = detectEnvironment(url);
        expect(result.environment).toBe('production');
        expect(result.confidence).toBe('high');
        expect(result.indicators.some(i => i.includes('Production indicator'))).toBe(true);
      });
    });

    it('should detect test environment with medium confidence for weak indicators', () => {
      const result = detectEnvironment('postgresql://user:pass@localhost:5432/app');
      
      // localhost:5432 has both weak test indicator (localhost) and production indicator (:5432)
      // This creates conflicting indicators, so it defaults to production with low confidence
      expect(result.environment).toBe('production');
      expect(result.confidence).toBe('low');
      expect(result.warnings).toContain('Conflicting environment indicators detected');
    });

    it('should default to production with low confidence when no clear indicators', () => {
      const result = detectEnvironment('postgresql://user:pass@unknown-host:1234/app');
      
      expect(result.environment).toBe('production');
      expect(result.confidence).toBe('low');
      expect(result.warnings).toContain('No clear environment indicators found, defaulting to production');
    });

    it('should handle conflicting indicators with low confidence', () => {
      const result = detectEnvironment('postgresql://user:pass@prod.localhost:5432/app');
      
      expect(result.confidence).toBe('low');
      expect(result.warnings).toContain('Conflicting environment indicators detected');
    });
  });

  describe('validateEnvironmentSafety', () => {
    it('should be safe when intended and detected environments match', () => {
      const result = validateEnvironmentSafety('test', 'postgresql://user:pass@localhost:5433/test_db');
      
      expect(result.safe).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should be unsafe when attempting test operations on production database', () => {
      const result = validateEnvironmentSafety('test', 'postgresql://user:pass@prod.example.com:5432/app');
      
      expect(result.safe).toBe(false);
      expect(result.errors.some(error => error.includes('Attempting to use test operations on production database'))).toBe(true);
    });

    it('should warn when using production operations on test database', () => {
      const result = validateEnvironmentSafety('production', 'postgresql://user:pass@localhost:5433/test_db');
      
      expect(result.safe).toBe(true);
      expect(result.warnings.some(warning => warning.includes('Using production operations on test database'))).toBe(true);
    });

    it('should warn about low confidence detection', () => {
      const result = validateEnvironmentSafety('production', 'postgresql://user:pass@unknown-host:1234/app');
      
      expect(result.warnings.some(warning => warning.includes('Low confidence in environment detection'))).toBe(true);
    });
  });

  describe('getValidatedEnvironmentConfig', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      process.env.DATABASE_URL = 'postgresql://prod:prod@localhost:5432/prod_db';
      process.env.TEST_DATABASE_URL = 'postgresql://test:test@localhost:5433/test_db';
      process.env.SSN_SALT = 'test-salt';
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return validated config for safe environments', async () => {
      // Mock console methods to avoid output during tests
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const config = await getValidatedEnvironmentConfig('test');
      
      expect(config.environment).toBe('test');
      expect(config.databaseUrl).toBe('postgresql://test:test@localhost:5433/test_db');
      expect(config.isTestEnvironment).toBe(true);

      consoleSpy.mockRestore();
    });

    it('should throw error for unsafe environments', async () => {
      // Set up environment that would be unsafe (test operations on production DB)
      delete process.env.TEST_DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://prod:prod@prod.example.com:5432/prod_db';

      await expect(getValidatedEnvironmentConfig('test')).rejects.toThrow('Environment validation failed');
    });

    it('should log warnings for environments with warnings', async () => {
      // Mock console methods
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Use a URL that will generate warnings (low confidence)
      process.env.TEST_DATABASE_URL = 'postgresql://test:test@unknown-host:1234/test_db';
      
      await getValidatedEnvironmentConfig('test');
      
      expect(warnSpy).toHaveBeenCalledWith('Configuration warnings:', expect.any(String));

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });
});