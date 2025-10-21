import { Pool } from 'pg';
import { DatabaseManager } from '../database-manager';

// Mock the entire pg module
jest.mock('pg');

// Mock ConfigurationManager
jest.mock('../../configuration/manager', () => ({
  ConfigurationManager: jest.fn().mockImplementation(() => ({
    getDatabaseUrl: jest.fn((env: 'test' | 'production') => {
      return env === 'test'
        ? 'postgresql://test:test@localhost:5433/test_db'
        : 'postgresql://prod:prod@localhost:5432/prod_db';
    }),
    getEnvironmentConfig: jest.fn((env: 'test' | 'production') => ({
      environment: env,
      databaseUrl: env === 'test'
        ? 'postgresql://test:test@localhost:5433/test_db'
        : 'postgresql://prod:prod@localhost:5432/prod_db',
      isTestEnvironment: env === 'test'
    })),
    validateEnvironmentVariables: jest.fn(() => ({
      isValid: true,
      errors: [],
      warnings: []
    })),
    getHashingSalts: jest.fn(() => ({
      ssnSalt: 'test-salt',
      dobSalt: 'test-dob-salt'
    })),
    isTestEnvironment: jest.fn(() => true)
  }))
}));

/**
 * Tests for DatabaseManager - Database Connection Management
 * 
 * Requirements tested:
 * - 6.1: Environment-specific database URL resolution
 * - 6.2: Connection validation and error handling  
 * - 6.3: Database connection pooling and lifecycle management
 */
describe('DatabaseManager', () => {
  let databaseManager: DatabaseManager;
  let originalEnv: NodeJS.ProcessEnv;
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Set up test environment variables
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
    process.env.TEST_DATABASE_URL = 'postgresql://test:test@localhost:5433/test_db';
    process.env.SSN_SALT = 'test-salt';
    process.env.DOB_SALT = 'test-dob-salt';

    // Create mock client
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [{ current_time: new Date(), pg_version: 'PostgreSQL 14.0' }] }),
      release: jest.fn()
    };

    // Create mock pool
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      end: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
      on: jest.fn()
    };

    // Mock Pool constructor to return new instances
    (Pool as jest.MockedClass<typeof Pool>).mockImplementation(() => ({
      ...mockPool,
      connect: jest.fn().mockResolvedValue(mockClient),
      end: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
      on: jest.fn()
    }));

    // Clear all mocks
    jest.clearAllMocks();

    // Create new DatabaseManager instance
    databaseManager = new DatabaseManager();
  });

  afterEach(async () => {
    // Clean up database manager
    try {
      if (databaseManager && databaseManager.isInitialized()) {
        await databaseManager.shutdown();
      }
    } catch (error) {
      // Ignore cleanup errors in tests
    }

    // Restore original environment
    process.env = originalEnv;
  });

  describe('Connection Pooling', () => {
    it('should create connection pool with correct test configuration', () => {
      const pool = databaseManager.getPool('test');

      expect(Pool).toHaveBeenCalledWith(expect.objectContaining({
        connectionString: 'postgresql://test:test@localhost:5433/test_db',
        max: 10,
        min: 2,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        allowExitOnIdle: true
      }));

      expect(pool).toBeDefined();
    });

    it('should create connection pool with correct production configuration', () => {
      const pool = databaseManager.getPool('production');

      expect(Pool).toHaveBeenCalledWith(expect.objectContaining({
        connectionString: 'postgresql://prod:prod@localhost:5432/prod_db',
        max: 20,
        min: 5,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 60000,
        allowExitOnIdle: false
      }));

      expect(pool).toBeDefined();
    });

    it('should reuse existing pool for same environment', () => {
      const pool1 = databaseManager.getPool('test');
      const pool2 = databaseManager.getPool('test');

      expect(pool1).toBe(pool2);
      expect(Pool).toHaveBeenCalledTimes(1);
    });

    it('should create separate pools for different environments', () => {
      const testPool = databaseManager.getPool('test');
      const prodPool = databaseManager.getPool('production');

      expect(Pool).toHaveBeenCalledTimes(2);
      expect(testPool).not.toBe(prodPool);
    });

    it('should apply custom pool configuration when provided', () => {
      const customConfig = {
        max: 15,
        min: 3,
        connectionTimeoutMillis: 8000,
        idleTimeoutMillis: 45000
      };

      databaseManager.getPool('test', customConfig);

      expect(Pool).toHaveBeenCalledWith(expect.objectContaining({
        connectionString: 'postgresql://test:test@localhost:5433/test_db',
        max: 15,
        min: 3,
        connectionTimeoutMillis: 8000,
        idleTimeoutMillis: 45000
      }));
    });

    it('should set up error handling for pools', () => {
      databaseManager.getPool('test');

      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should prevent pool creation after shutdown', async () => {
      await databaseManager.shutdown();

      expect(() => databaseManager.getPool('test')).toThrow('DatabaseManager has been shut down');
    });
  });

  describe('Connection Lifecycle Management', () => {
    beforeEach(() => {
      // Set up successful connection mock
      mockClient.query.mockResolvedValue({
        rows: [{ current_time: new Date(), pg_version: 'PostgreSQL 15.0' }]
      });
      mockPool.connect.mockResolvedValue(mockClient);
    });

    it('should initialize connection pools successfully', async () => {
      await databaseManager.initialize();

      expect(databaseManager.isInitialized()).toBe(true);
      expect(Pool).toHaveBeenCalledTimes(2); // test and production pools
    });

    it('should validate connections during initialization', async () => {
      await databaseManager.initialize();

      // Should validate both test and production connections
      expect(mockPool.connect).toHaveBeenCalledTimes(2);
      expect(mockClient.query).toHaveBeenCalledWith('SELECT NOW() as current_time, version() as pg_version');
      expect(mockClient.release).toHaveBeenCalledTimes(2);
    });

    it('should handle initialization failure when connection validation fails', async () => {
      mockPool.connect.mockRejectedValue(new Error('Connection timeout'));

      await expect(databaseManager.initialize()).rejects.toThrow('Failed to initialize database connections');
      expect(databaseManager.isInitialized()).toBe(false);
    });

    it('should handle initialization failure when query fails', async () => {
      mockClient.query.mockRejectedValue(new Error('Query failed'));

      await expect(databaseManager.initialize()).rejects.toThrow('Failed to initialize database connections');
      expect(databaseManager.isInitialized()).toBe(false);
    });

    it('should shutdown all pools gracefully', async () => {
      // Initialize to create pools
      await databaseManager.initialize();

      // Reset mock to track shutdown calls
      mockPool.end.mockClear();

      await databaseManager.shutdown();

      expect(mockPool.end).toHaveBeenCalledTimes(2); // Both pools should be shut down
      expect(databaseManager.isInitialized()).toBe(false);
    });

    it('should handle shutdown errors gracefully', async () => {
      // Create a pool
      databaseManager.getPool('test');

      // Mock shutdown failure
      mockPool.end.mockRejectedValue(new Error('Shutdown failed'));

      // Should not throw, but handle the error gracefully
      await expect(databaseManager.shutdown()).resolves.not.toThrow();
    });

    it('should prevent operations after shutdown', async () => {
      await databaseManager.shutdown();

      expect(() => databaseManager.getPool('test')).toThrow('DatabaseManager has been shut down');
    });

    it('should track initialization state correctly', () => {
      expect(databaseManager.isInitialized()).toBe(false);
    });
  });

  describe('Connection Validation and Error Handling', () => {
    it('should validate connection health successfully', async () => {
      // Set up successful connection scenario
      mockClient.query.mockResolvedValue({
        rows: [{ current_time: new Date(), pg_version: 'PostgreSQL 15.0' }]
      });
      mockPool.connect.mockResolvedValue(mockClient);

      const isHealthy = await databaseManager.validateConnection('test');

      expect(isHealthy).toBe(true);
    });

    it('should handle connection failure during validation', async () => {
      mockPool.connect.mockRejectedValue(new Error('Connection timeout'));

      const isHealthy = await databaseManager.validateConnection('test');

      expect(isHealthy).toBe(false);
    });

    it('should handle query failure during validation', async () => {
      mockClient.query.mockRejectedValue(new Error('Query failed'));
      mockPool.connect.mockResolvedValue(mockClient);

      const isHealthy = await databaseManager.validateConnection('test');

      expect(isHealthy).toBe(false);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should retry failed connections with exponential backoff', async () => {
      let attemptCount = 0;
      mockPool.connect.mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 2) {
          return Promise.reject(new Error('Connection failed'));
        }
        return Promise.resolve(mockClient);
      });

      mockClient.query.mockResolvedValue({
        rows: [{ current_time: new Date(), pg_version: 'PostgreSQL 15.0' }]
      });

      const isHealthy = await databaseManager.validateConnectionWithRetry('test', 3, 10);

      expect(isHealthy).toBe(true);
      expect(attemptCount).toBe(3);
    });

    it('should fail after maximum retry attempts', async () => {
      mockPool.connect.mockRejectedValue(new Error('Connection failed'));

      const isHealthy = await databaseManager.validateConnectionWithRetry('test', 2, 10);

      expect(isHealthy).toBe(false);
    });

    it('should handle pool errors through error handler', () => {
      const errorHandler = jest.fn();
      let capturedErrorHandler: Function | undefined;

      mockPool.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'error') {
          capturedErrorHandler = handler;
        }
      });

      databaseManager.onPoolError(errorHandler);
      databaseManager.getPool('test');

      expect(capturedErrorHandler).toBeDefined();

      // Simulate a pool error
      const testError = new Error('Pool connection lost');
      capturedErrorHandler!(testError);

      expect(errorHandler).toHaveBeenCalledWith(testError, 'test');
    });

    it('should handle errors in error handlers gracefully', () => {
      const faultyErrorHandler = jest.fn().mockImplementation(() => {
        throw new Error('Error handler failed');
      });

      let capturedErrorHandler: Function | undefined;

      mockPool.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'error') {
          capturedErrorHandler = handler;
        }
      });

      databaseManager.onPoolError(faultyErrorHandler);
      databaseManager.getPool('test');

      // Should not throw when error handler fails
      expect(() => capturedErrorHandler!(new Error('Pool error'))).not.toThrow();
    });
  });



  describe('Pool Statistics and Monitoring', () => {
    it('should provide accurate pool statistics', () => {
      // Set up mock pool with specific stats
      mockPool.totalCount = 10;
      mockPool.idleCount = 5;
      mockPool.waitingCount = 2;

      databaseManager.getPool('test');
      const stats = databaseManager.getPoolStats('test');

      expect(stats).toEqual({
        environment: 'test',
        totalConnections: 10,
        idleConnections: 5,
        waitingConnections: 2,
        activeConnections: 5
      });
    });

    it('should return null stats for non-existent pool', () => {
      const stats = databaseManager.getPoolStats('nonexistent' as any);

      expect(stats).toBeNull();
    });

    it('should provide statistics for all active pools', () => {
      // Create pools for both environments
      databaseManager.getPool('test');
      databaseManager.getPool('production');

      const allStats = databaseManager.getAllPoolStats();

      expect(allStats).toHaveLength(2);
      expect(allStats.map(s => s.environment)).toEqual(expect.arrayContaining(['test', 'production']));
    });

    it('should calculate active connections correctly', () => {
      mockPool.totalCount = 15;
      mockPool.idleCount = 8;
      mockPool.waitingCount = 3;

      databaseManager.getPool('test');
      const stats = databaseManager.getPoolStats('test');

      expect(stats?.activeConnections).toBe(7); // totalCount - idleCount
    });

    it('should handle pools with zero connections', () => {
      mockPool.totalCount = 0;
      mockPool.idleCount = 0;
      mockPool.waitingCount = 0;

      databaseManager.getPool('test');
      const stats = databaseManager.getPoolStats('test');

      expect(stats).toEqual({
        environment: 'test',
        totalConnections: 0,
        idleConnections: 0,
        waitingConnections: 0,
        activeConnections: 0
      });
    });
  });

  describe('Connection Health Monitoring', () => {
    it('should perform health check on all active pools', async () => {
      mockClient.query.mockResolvedValue({
        rows: [{ current_time: new Date(), pg_version: 'PostgreSQL 15.0' }]
      });
      mockPool.connect.mockResolvedValue(mockClient);

      // Create pools for both environments
      databaseManager.getPool('test');
      databaseManager.getPool('production');

      const healthStatus = await databaseManager.checkAllConnectionsHealth();

      expect(healthStatus).toEqual({
        test: true,
        production: true
      });
    });

    it('should detect unhealthy connections', async () => {
      mockPool.connect.mockRejectedValue(new Error('Connection failed'));

      databaseManager.getPool('test');

      const healthStatus = await databaseManager.checkAllConnectionsHealth();

      expect(healthStatus).toEqual({
        test: false
      });
    });

    it('should return empty health status when no pools exist', async () => {
      const healthStatus = await databaseManager.checkAllConnectionsHealth();

      expect(healthStatus).toEqual({});
    });

    it('should handle health check errors gracefully', async () => {
      mockPool.connect.mockImplementation(() => {
        throw new Error('Unexpected connection error');
      });

      databaseManager.getPool('test');

      const healthStatus = await databaseManager.checkAllConnectionsHealth();

      expect(healthStatus.test).toBe(false);
    });
  });

  describe('Environment-Specific Database URL Resolution', () => {
    it('should resolve test database URL correctly', () => {
      const url = databaseManager.getDatabaseUrl('test');

      expect(url).toBe('postgresql://test:test@localhost:5433/test_db');
    });

    it('should resolve production database URL correctly', () => {
      const url = databaseManager.getDatabaseUrl('production');

      expect(url).toBe('postgresql://prod:prod@localhost:5432/prod_db');
    });

    it('should use ConfigurationManager for environment configuration', () => {
      databaseManager.getPool('test');

      // Pool should be created with correct configuration
      expect(Pool).toHaveBeenCalledWith(expect.objectContaining({
        connectionString: 'postgresql://test:test@localhost:5433/test_db'
      }));
    });
  });
});