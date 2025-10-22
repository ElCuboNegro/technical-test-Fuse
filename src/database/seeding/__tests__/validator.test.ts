// Tests for database validator

import { DatabaseValidator } from '../validator';
import { Pool } from 'pg';

// Mock pg module
jest.mock('pg');
const MockPool = Pool as jest.MockedClass<typeof Pool>;

describe('DatabaseValidator', () => {
  let validator: DatabaseValidator;
  let mockPool: jest.Mocked<Pool>;
  let mockClient: any;

  const testDatabaseUrl = 'postgresql://test:test@localhost:5433/agents_app_test';

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn(),
      end: jest.fn().mockResolvedValue(undefined)
    } as any;

    MockPool.mockImplementation(() => mockPool);

    validator = new DatabaseValidator(testDatabaseUrl);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateConnection', () => {
    it('should return true for successful connection', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

      const result = await validator.validateConnection(testDatabaseUrl);

      expect(result).toBe(true);
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT 1');
      expect(mockClient.release).toHaveBeenCalled();
      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should return false for connection failure', async () => {
      mockPool.connect.mockRejectedValue(new Error('Connection failed'));

      const result = await validator.validateConnection(testDatabaseUrl);

      expect(result).toBe(false);
      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should return false for query failure', async () => {
      mockClient.query.mockRejectedValue(new Error('Query failed'));

      const result = await validator.validateConnection(testDatabaseUrl);

      expect(result).toBe(false);
      expect(mockPool.end).toHaveBeenCalled();
    });
  });

  describe('validateEnvironment', () => {
    it('should return true for test environment with test database', async () => {
      mockPool.query.mockResolvedValue({ 
        rows: [{ current_database: 'agents_app_test' }] 
      });

      const result = await validator.validateEnvironment('test');

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT current_database()');
    });

    it('should return false for test environment with production database', async () => {
      mockPool.query.mockResolvedValue({ 
        rows: [{ current_database: 'agents_app_prod' }] 
      });

      const result = await validator.validateEnvironment('test');

      expect(result).toBe(false);
    });

    it('should return false for production environment with test database', async () => {
      mockPool.query.mockResolvedValue({ 
        rows: [{ current_database: 'agents_app_test' }] 
      });

      const result = await validator.validateEnvironment('production');

      expect(result).toBe(false);
    });

    it('should return true for production environment with production database', async () => {
      mockPool.query.mockResolvedValue({ 
        rows: [{ current_database: 'agents_app_prod' }] 
      });

      const result = await validator.validateEnvironment('production');

      expect(result).toBe(true);
    });

    it('should return false for database query failure', async () => {
      mockPool.query.mockRejectedValue(new Error('Query failed'));

      const result = await validator.validateEnvironment('test');

      expect(result).toBe(false);
    });
  });

  describe('checkRequiredTables', () => {
    it('should return empty array when all tables exist', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { table_name: 'schema_migrations' },
          { table_name: 'identity_records' },
          { table_name: 'contact_information' },
          { table_name: 'financial_data' },
          { table_name: 'application_data' },
          { table_name: 'test_scenarios' }
        ]
      });

      const result = await validator.checkRequiredTables();

      expect(result).toEqual([]);
    });

    it('should return missing tables', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { table_name: 'schema_migrations' },
          { table_name: 'identity_records' }
        ]
      });

      const result = await validator.checkRequiredTables();

      expect(result).toEqual([
        'contact_information',
        'financial_data',
        'application_data',
        'test_scenarios'
      ]);
    });

    it('should throw error for query failure', async () => {
      mockPool.query.mockRejectedValue(new Error('Query failed'));

      await expect(validator.checkRequiredTables()).rejects.toThrow('Failed to check required tables: Query failed');
    });
  });

  describe('validateSchema', () => {
    it('should return valid schema when all elements exist', async () => {
      // Mock tables query
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { table_name: 'schema_migrations' },
            { table_name: 'identity_records' },
            { table_name: 'contact_information' },
            { table_name: 'financial_data' },
            { table_name: 'application_data' },
            { table_name: 'test_scenarios' }
          ]
        })
        // Mock indexes query
        .mockResolvedValueOnce({
          rows: [
            { indexname: 'idx_identity_records_ref' },
            { indexname: 'idx_identity_records_combo' },
            { indexname: 'idx_contact_external_ref' },
            { indexname: 'idx_financial_external_ref' },
            { indexname: 'idx_application_external_ref' },
            { indexname: 'idx_test_scenarios_name' }
          ]
        })
        // Mock column queries for each table
        .mockResolvedValueOnce({
          rows: [
            { column_name: 'id' },
            { column_name: 'external_ref' },
            { column_name: 'name' },
            { column_name: 'dob' },
            { column_name: 'dob_hash' },
            { column_name: 'ssn4_hash' },
            { column_name: 'created_at' },
            { column_name: 'updated_at' }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            { column_name: 'id' },
            { column_name: 'external_ref' },
            { column_name: 'street_address' },
            { column_name: 'city' },
            { column_name: 'state' },
            { column_name: 'zip_code' },
            { column_name: 'created_at' },
            { column_name: 'updated_at' }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            { column_name: 'id' },
            { column_name: 'external_ref' },
            { column_name: 'monthly_income' },
            { column_name: 'employment_status' },
            { column_name: 'created_at' },
            { column_name: 'updated_at' }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            { column_name: 'id' },
            { column_name: 'external_ref' },
            { column_name: 'application_id' },
            { column_name: 'status' },
            { column_name: 'metadata' },
            { column_name: 'created_at' },
            { column_name: 'updated_at' }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            { column_name: 'id' },
            { column_name: 'scenario_name' },
            { column_name: 'description' },
            { column_name: 'expected_flow' },
            { column_name: 'expected_outcome' },
            { column_name: 'scenario_type' },
            { column_name: 'created_at' },
            { column_name: 'updated_at' }
          ]
        });

      const result = await validator.validateSchema();

      expect(result.tablesExist).toBe(true);
      expect(result.indexesExist).toBe(true);
      expect(result.columnsValid).toBe(true);
      expect(result.missingElements).toEqual([]);
    });

    it('should identify missing tables', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { table_name: 'schema_migrations' },
            { table_name: 'identity_records' }
          ]
        })
        .mockResolvedValueOnce({
          rows: []
        })
        .mockResolvedValueOnce({
          rows: [
            { column_name: 'id' },
            { column_name: 'external_ref' },
            { column_name: 'name' },
            { column_name: 'dob' },
            { column_name: 'dob_hash' },
            { column_name: 'ssn4_hash' },
            { column_name: 'created_at' },
            { column_name: 'updated_at' }
          ]
        })
        .mockResolvedValue({ rows: [] });

      const result = await validator.validateSchema();

      expect(result.tablesExist).toBe(false);
      expect(result.missingElements).toContain('table: contact_information');
      expect(result.missingElements).toContain('table: financial_data');
      expect(result.missingElements).toContain('table: application_data');
      expect(result.missingElements).toContain('table: test_scenarios');
    });

    it('should throw error for schema validation failure', async () => {
      mockPool.query.mockRejectedValue(new Error('Schema query failed'));

      await expect(validator.validateSchema()).rejects.toThrow('Schema validation failed: Schema query failed');
    });
  });

  describe('close', () => {
    it('should close database connection pool', async () => {
      // First trigger pool creation by calling a method that uses it
      mockPool.query.mockResolvedValue({ rows: [] });
      await validator.checkRequiredTables();
      
      await validator.close();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should handle multiple close calls gracefully', async () => {
      // First trigger pool creation
      mockPool.query.mockResolvedValue({ rows: [] });
      await validator.checkRequiredTables();
      
      await validator.close();
      await validator.close();

      expect(mockPool.end).toHaveBeenCalledTimes(1);
    });
  });
});