// Tests for migration validator

import { MigrationValidator } from '../validator';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('MigrationValidator', () => {
  let validator: MigrationValidator;
  const testMigrationsPath = './test-migrations';

  beforeEach(() => {
    validator = new MigrationValidator(testMigrationsPath);
    jest.clearAllMocks();
  });

  describe('isValidMigrationFilename', () => {
    it('should validate correct migration filename format', () => {
      const validFilenames = [
        '001_initial_schema.sql',
        '002_create_users.sql',
        '123_add_index_to_table.sql'
      ];

      validFilenames.forEach(filename => {
        expect(validator.isValidMigrationFilename(filename)).toBe(true);
      });
    });

    it('should reject invalid migration filename formats', () => {
      const invalidFilenames = [
        'invalid.sql',
        '1_test.sql', // Version too short
        '001-test.sql', // Dash instead of underscore
        '001_test.txt', // Wrong extension
        '001_.sql', // Empty name
        'abc_test.sql' // Non-numeric version
      ];

      invalidFilenames.forEach(filename => {
        expect(validator.isValidMigrationFilename(filename)).toBe(false);
      });
    });
  });

  describe('extractVersion', () => {
    it('should extract version from valid migration filename', () => {
      expect(validator.extractVersion('001_initial_schema.sql')).toBe('001');
      expect(validator.extractVersion('123_create_table.sql')).toBe('123');
    });

    it('should return empty string for invalid filename', () => {
      expect(validator.extractVersion('invalid.sql')).toBe('');
      expect(validator.extractVersion('test_migration.sql')).toBe('');
    });
  });

  describe('getRollbackFilename', () => {
    it('should generate correct rollback filename', () => {
      expect(validator.getRollbackFilename('001_initial_schema.sql')).toBe('001_initial_schema_rollback.sql');
      expect(validator.getRollbackFilename('002_create_users.sql')).toBe('002_create_users_rollback.sql');
    });
  });

  describe('validateMigrationFile', () => {
    it('should validate existing migration file with rollback', async () => {
      const filename = '001_initial_schema.sql';
      
      mockFs.existsSync.mockImplementation((filePath) => {
        const pathStr = filePath.toString();
        return pathStr.includes(filename) || pathStr.includes('001_initial_schema_rollback.sql');
      });
      
      mockFs.readFileSync.mockReturnValue('CREATE TABLE test (id INTEGER);');

      const result = await validator.validateMigrationFile(filename);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn when rollback file is missing', async () => {
      const filename = '001_initial_schema.sql';
      
      mockFs.existsSync.mockImplementation((filePath) => {
        const pathStr = filePath.toString();
        return pathStr.includes(filename) && !pathStr.includes('rollback');
      });
      
      mockFs.readFileSync.mockReturnValue('CREATE TABLE test (id INTEGER);');

      const result = await validator.validateMigrationFile(filename);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toContain('No rollback file found for migration: 001_initial_schema.sql');
    });

    it('should fail validation for invalid filename format', async () => {
      const filename = 'invalid.sql';

      const result = await validator.validateMigrationFile(filename);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid migration filename format: invalid.sql');
    });

    it('should fail validation for missing file', async () => {
      const filename = '001_initial_schema.sql';
      
      mockFs.existsSync.mockReturnValue(false);

      const result = await validator.validateMigrationFile(filename);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Migration file not found: 001_initial_schema.sql');
    });

    it('should fail validation for empty file', async () => {
      const filename = '001_initial_schema.sql';
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('   '); // Whitespace only

      const result = await validator.validateMigrationFile(filename);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Migration file is empty: 001_initial_schema.sql');
    });
  });

  describe('validateAllMigrations', () => {
    it('should validate all migration files successfully', async () => {
      const migrationFiles = ['001_initial_schema.sql', '002_create_users.sql'];
      
      mockFs.readdirSync.mockReturnValue(migrationFiles as any);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('CREATE TABLE test (id INTEGER);');

      const result = await validator.validateAllMigrations();

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect duplicate migration versions', async () => {
      const migrationFiles = ['001_initial_schema.sql', '001_duplicate_version.sql'];
      
      mockFs.readdirSync.mockReturnValue(migrationFiles as any);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('CREATE TABLE test (id INTEGER);');

      const result = await validator.validateAllMigrations();

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Duplicate migration versions found: 001');
    });

    it('should handle directory read errors', async () => {
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('Directory not found');
      });

      const result = await validator.validateAllMigrations();

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Failed to validate migrations: Directory not found');
    });
  });
});