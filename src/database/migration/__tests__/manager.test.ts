// Tests for migration manager

import { MigrationManager } from '../manager';

describe('MigrationManager', () => {
  let migrationManager: MigrationManager;

  beforeEach(() => {
    migrationManager = new MigrationManager('test');
  });

  describe('generateMigrationFilename', () => {
    it('should generate filename with timestamp and sanitized name', () => {
      const filename = migrationManager.generateMigrationFilename('Create User Table');
      
      expect(filename).toMatch(/^\d{14}_create_user_table\.sql$/);
    });

    it('should sanitize special characters in migration name', () => {
      const filename = migrationManager.generateMigrationFilename('Add-Index@Column#1');
      
      expect(filename).toMatch(/^\d{14}_add_index_column_1\.sql$/);
    });

    it('should handle empty migration name', () => {
      const filename = migrationManager.generateMigrationFilename('');
      
      expect(filename).toMatch(/^\d{14}_\.sql$/);
    });
  });

  describe('parseMigrationFilename', () => {
    it('should parse valid migration filename correctly', () => {
      const result = migrationManager.parseMigrationFilename('001_initial_schema.sql');
      
      expect(result.version).toBe('001');
      expect(result.name).toBe('initial_schema');
    });

    it('should parse filename with underscores in name', () => {
      const result = migrationManager.parseMigrationFilename('002_create_user_table.sql');
      
      expect(result.version).toBe('002');
      expect(result.name).toBe('create_user_table');
    });

    it('should throw error for invalid filename format', () => {
      expect(() => {
        migrationManager.parseMigrationFilename('invalid-filename.sql');
      }).toThrow('Invalid migration filename format: invalid-filename.sql');
    });

    it('should throw error for filename without .sql extension', () => {
      expect(() => {
        migrationManager.parseMigrationFilename('001_test.txt');
      }).toThrow('Invalid migration filename format: 001_test.txt');
    });

    it('should throw error for filename without version number', () => {
      expect(() => {
        migrationManager.parseMigrationFilename('test_migration.sql');
      }).toThrow('Invalid migration filename format: test_migration.sql');
    });
  });

  describe('generateChecksum', () => {
    it('should generate consistent checksum for same content', () => {
      const content = 'CREATE TABLE test (id INTEGER);';
      
      const checksum1 = migrationManager.generateChecksum(content);
      const checksum2 = migrationManager.generateChecksum(content);
      
      expect(checksum1).toBe(checksum2);
      expect(checksum1).toHaveLength(64); // SHA-256 hex length
    });

    it('should generate different checksums for different content', () => {
      const content1 = 'CREATE TABLE test1 (id INTEGER);';
      const content2 = 'CREATE TABLE test2 (id INTEGER);';
      
      const checksum1 = migrationManager.generateChecksum(content1);
      const checksum2 = migrationManager.generateChecksum(content2);
      
      expect(checksum1).not.toBe(checksum2);
    });

    it('should handle empty content', () => {
      const checksum = migrationManager.generateChecksum('');
      
      expect(checksum).toHaveLength(64);
      expect(checksum).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'); // SHA-256 of empty string
    });
  });

  describe('interface compliance', () => {
    it('should implement all required MigrationManager methods', () => {
      expect(typeof migrationManager.runMigrations).toBe('function');
      expect(typeof migrationManager.rollbackMigration).toBe('function');
      expect(typeof migrationManager.getCurrentVersion).toBe('function');
      expect(typeof migrationManager.getPendingMigrations).toBe('function');
      expect(typeof migrationManager.createMigration).toBe('function');
      expect(typeof migrationManager.validateMigrations).toBe('function');
    });

    it('should throw "not implemented" errors for placeholder methods', async () => {
      await expect(migrationManager.runMigrations('test')).rejects.toThrow('Method not implemented');
      await expect(migrationManager.rollbackMigration('001')).rejects.toThrow('Method not implemented');
      await expect(migrationManager.getCurrentVersion()).rejects.toThrow('Method not implemented');
      await expect(migrationManager.getPendingMigrations()).rejects.toThrow('Method not implemented');
      await expect(migrationManager.createMigration('test')).rejects.toThrow('Method not implemented');
      await expect(migrationManager.validateMigrations()).rejects.toThrow('Method not implemented');
    });
  });
});