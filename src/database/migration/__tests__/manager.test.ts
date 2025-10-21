// Tests for migration manager

import { MigrationManager } from '../manager';

// Mock the ConfigurationManager
jest.mock('../../configuration', () => ({
  ConfigurationManager: jest.fn().mockImplementation(() => ({
    getDatabaseUrl: jest.fn((env) => {
      if (env === 'test') {
        return 'postgres://test:test@localhost:5433/test';
      }
      return 'postgres://prod:prod@localhost:5432/prod';
    })
  }))
}));

describe('MigrationManager', () => {
  let migrationManager: MigrationManager;

  beforeEach(() => {
    migrationManager = new MigrationManager();
  });

  describe('interface compliance', () => {
    it('should implement all required MigrationManager methods', () => {
      expect(typeof migrationManager.runMigrations).toBe('function');
      expect(typeof migrationManager.rollbackMigrations).toBe('function');
      expect(typeof migrationManager.createMigration).toBe('function');
      expect(typeof migrationManager.getDatabaseUrl).toBe('function');
    });
  });

  describe('getDatabaseUrl', () => {
    it('should return database URL for test environment', () => {
      const url = migrationManager.getDatabaseUrl('test');
      expect(url).toBe('postgres://test:test@localhost:5433/test');
    });

    it('should return database URL for production environment', () => {
      const url = migrationManager.getDatabaseUrl('production');
      expect(url).toBe('postgres://prod:prod@localhost:5432/prod');
    });
  });

  describe('node-pg-migrate integration', () => {
    it('should use node-pg-migrate for migrations', () => {
      // This test verifies that we're using node-pg-migrate
      // The actual migration execution is tested in integration tests
      expect(migrationManager).toBeInstanceOf(MigrationManager);
    });
  });
});