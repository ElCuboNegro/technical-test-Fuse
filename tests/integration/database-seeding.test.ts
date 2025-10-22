/**
 * Database Seeding Integration Tests
 * Requirements addressed: 1.4, 1.5, 7.6
 * 
 * Tests for complete seeding process with all mock data scenarios,
 * upsert logic and duplicate handling, and foreign key relationships.
 */

import { Pool } from 'pg';
import { DatabaseSeeder } from '../../src/database/seeding/seeder';
import { MockDataParser } from '../../src/database/seeding/parser';
import { DatabaseValidator } from '../../src/database/seeding/validator';
import { TestScenario, SeedingResult } from '../../src/database/interfaces';

describe('Database Seeding Integration Tests', () => {
  let pool: Pool;
  let seeder: DatabaseSeeder;
  let parser: MockDataParser;
  let validator: DatabaseValidator;
  let testScenarios: TestScenario[];
  let isDatabaseAvailable = false;

  beforeAll(async () => {
    // Use test database URL
    const testDatabaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://dev_user:dev_password@localhost:5432/agents_app_dev';
    
    pool = new Pool({
      connectionString: testDatabaseUrl,
      max: 5,
      connectionTimeoutMillis: 5000
    });

    seeder = new DatabaseSeeder(pool);
    parser = new MockDataParser();
    validator = new DatabaseValidator(testDatabaseUrl);

    // Parse test scenarios
    testScenarios = await parser.parseTestScenarios();

    // Try to validate database connection and schema
    try {
      isDatabaseAvailable = await validator.validateConnection(testDatabaseUrl);
      if (!isDatabaseAvailable) {
        console.warn('Database connection not available - tests will be skipped');
      }
    } catch (error) {
      console.warn('Database connection failed - tests will be skipped:', error.message);
      isDatabaseAvailable = false;
    }
  });

  afterAll(async () => {
    await validator.close();
    await pool.end();
  });

  beforeEach(async () => {
    // Skip test if database is not available
    if (!isDatabaseAvailable) {
      pending('Database not available');
      return;
    }
    
    // Clean up test data before each test
    await cleanupTestData();
  });

  // Helper function to skip tests when database is not available
  const skipIfNoDB = () => {
    if (!isDatabaseAvailable) {
      pending('Database not available');
    }
  };

  describe('Complete Seeding Process', () => {
    test('should seed all tables with complete mock data scenarios', async () => {
      skipIfNoDB();
      
      // Test complete seeding workflow
      const results = await seeder.seedAllTables(testScenarios, {
        dryRun: false,
        batchSize: 100,
        skipValidation: false
      });

      // Verify all tables were processed
      expect(results).toHaveLength(5);
      const tableNames = results.map(r => r.tableName);
      expect(tableNames).toContain('identity_records');
      expect(tableNames).toContain('contact_information');
      expect(tableNames).toContain('financial_data');
      expect(tableNames).toContain('application_data');
      expect(tableNames).toContain('test_scenarios');

      // Verify records were inserted
      const totalInserted = results.reduce((sum, r) => sum + r.recordsInserted, 0);
      expect(totalInserted).toBeGreaterThan(0);

      // Verify no errors occurred
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      expect(totalErrors).toBe(0);
    });

    test('should handle all scenario types from mock data', async () => {
      const results = await seeder.seedAllTables(testScenarios);

      // Verify specific scenarios were processed
      const scenarioNames = testScenarios.map(s => s.scenario_name);
      expect(scenarioNames).toContain('successful_verification');
      expect(scenarioNames).toContain('identity_verification_failure');
      expect(scenarioNames).toContain('self_employed_applicant');
      expect(scenarioNames).toContain('job_tenure_discrepancy');

      // Verify all scenarios were processed
      const identityResult = results.find(r => r.tableName === 'identity_records');
      expect(identityResult?.recordsProcessed).toBe(testScenarios.length);
    });

    test('should maintain data integrity across all tables', async () => {
      await seeder.seedAllTables(testScenarios);

      // Verify foreign key relationships
      const client = await pool.connect();
      try {
        // Check that all contact_information records have matching identity_records
        const contactOrphans = await client.query(`
          SELECT ci.external_ref 
          FROM contact_information ci 
          LEFT JOIN identity_records ir ON ci.external_ref = ir.external_ref 
          WHERE ir.external_ref IS NULL
        `);
        expect(contactOrphans.rows).toHaveLength(0);

        // Check that all financial_data records have matching identity_records
        const financialOrphans = await client.query(`
          SELECT fd.external_ref 
          FROM financial_data fd 
          LEFT JOIN identity_records ir ON fd.external_ref = ir.external_ref 
          WHERE ir.external_ref IS NULL
        `);
        expect(financialOrphans.rows).toHaveLength(0);

        // Check that all application_data records have matching identity_records
        const applicationOrphans = await client.query(`
          SELECT ad.external_ref 
          FROM application_data ad 
          LEFT JOIN identity_records ir ON ad.external_ref = ir.external_ref 
          WHERE ir.external_ref IS NULL
        `);
        expect(applicationOrphans.rows).toHaveLength(0);

      } finally {
        client.release();
      }
    });
  });

  describe('Upsert Logic and Duplicate Handling', () => {
    test('should insert new records on first run', async () => {
      const results = await seeder.seedAllTables(testScenarios);

      // Verify records were inserted, not updated
      results.forEach(result => {
        expect(result.recordsInserted).toBeGreaterThan(0);
        expect(result.recordsUpdated).toBe(0);
      });
    });

    test('should update existing records on subsequent runs', async () => {
      // First run - insert records
      await seeder.seedAllTables(testScenarios);

      // Second run - should update existing records
      const results = await seeder.seedAllTables(testScenarios);

      // Verify records were updated, not inserted
      // At least identity_records should have updates since all scenarios have identity data
      const identityResult = results.find(r => r.tableName === 'identity_records');
      expect(identityResult).toBeDefined();
      expect(identityResult!.recordsProcessed).toBeGreaterThan(0);
      expect(identityResult!.recordsUpdated).toBeGreaterThan(0);
      expect(identityResult!.recordsInserted).toBe(0);

      // Other tables should either have updates or no records processed
      results.forEach(result => {
        if (result.recordsProcessed > 0) {
          expect(result.recordsUpdated).toBeGreaterThan(0);
          expect(result.recordsInserted).toBe(0);
        }
      });
    });

    test('should handle mixed insert and update operations', async () => {
      // Seed subset of scenarios first
      const firstBatch = testScenarios.slice(0, 3);
      await seeder.seedAllTables(firstBatch);

      // Seed all scenarios (should update first 3, insert remaining)
      const results = await seeder.seedAllTables(testScenarios);

      const identityResult = results.find(r => r.tableName === 'identity_records');
      expect(identityResult?.recordsInserted).toBe(testScenarios.length - 3);
      expect(identityResult?.recordsUpdated).toBe(3);
    });

    test('should maintain referential integrity during upserts', async () => {
      // Initial seeding
      await seeder.seedAllTables(testScenarios);

      // Modify a scenario and re-seed
      const modifiedScenarios = [...testScenarios];
      modifiedScenarios[0].applicant_data.monthly_income = 9999;

      await seeder.seedAllTables(modifiedScenarios);

      // Verify the update was applied
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT monthly_income FROM financial_data WHERE external_ref = $1',
          [modifiedScenarios[0].scenario_name]
        );
        expect(result.rows[0]?.monthly_income).toBe('9999.00');
      } finally {
        client.release();
      }
    });
  });

  describe('Individual Table Seeding', () => {
    test('should seed identity_records with hashed PII data', async () => {
      const result = await seeder.seedIdentityRecords(testScenarios);

      expect(result.tableName).toBe('identity_records');
      expect(result.recordsProcessed).toBe(testScenarios.length);
      expect(result.recordsInserted).toBe(testScenarios.length);
      expect(result.errors).toHaveLength(0);

      // Verify hashed data is stored
      const client = await pool.connect();
      try {
        const records = await client.query('SELECT * FROM identity_records LIMIT 1');
        const record = records.rows[0];
        
        expect(record.dob_hash).toBeDefined();
        expect(record.ssn4_hash).toBeDefined();
        expect(record.dob_hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
        expect(record.ssn4_hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
        
        // Verify raw DOB is also stored for testing purposes
        expect(record.dob).toBeDefined();
        expect(record.name).toBeDefined();
      } finally {
        client.release();
      }
    });

    test('should seed contact_information with address data', async () => {
      // Seed identity records first (foreign key dependency)
      await seeder.seedIdentityRecords(testScenarios);
      
      const result = await seeder.seedContactInformation(testScenarios);

      expect(result.tableName).toBe('contact_information');
      expect(result.recordsProcessed).toBeGreaterThan(0);
      expect(result.recordsInserted).toBeGreaterThan(0);

      // Verify contact data structure
      const client = await pool.connect();
      try {
        const records = await client.query('SELECT * FROM contact_information LIMIT 1');
        const record = records.rows[0];
        
        expect(record.street_address).toBeDefined();
        expect(record.city).toBeDefined();
        expect(record.state).toBeDefined();
        expect(record.zip_code).toBeDefined();
        // unit_number and email can be null
      } finally {
        client.release();
      }
    });

    test('should seed financial_data with employment information', async () => {
      // Seed identity records first
      await seeder.seedIdentityRecords(testScenarios);
      
      const result = await seeder.seedFinancialData(testScenarios);

      expect(result.tableName).toBe('financial_data');
      expect(result.recordsProcessed).toBeGreaterThan(0);
      expect(result.recordsInserted).toBeGreaterThan(0);

      // Verify financial data structure
      const client = await pool.connect();
      try {
        const records = await client.query('SELECT * FROM financial_data LIMIT 1');
        const record = records.rows[0];
        
        expect(record.monthly_income).toBeDefined();
        expect(record.employment_status).toBeDefined();
        // job_tenure_months can be null for self-employed
      } finally {
        client.release();
      }
    });

    test('should seed application_data with metadata', async () => {
      // Seed identity records first
      await seeder.seedIdentityRecords(testScenarios);
      
      const result = await seeder.seedApplicationData(testScenarios);

      expect(result.tableName).toBe('application_data');
      expect(result.recordsProcessed).toBe(testScenarios.length);
      expect(result.recordsInserted).toBe(testScenarios.length);

      // Verify application data structure
      const client = await pool.connect();
      try {
        const records = await client.query('SELECT * FROM application_data LIMIT 1');
        const record = records.rows[0];
        
        expect(record.application_id).toBeDefined();
        expect(record.status).toBeDefined();
        expect(record.metadata).toBeDefined();
        
        // Verify metadata is valid JSON (JSONB columns return objects directly)
        const metadata = typeof record.metadata === 'string' ? JSON.parse(record.metadata) : record.metadata;
        expect(metadata.test).toBe(true);
        expect(metadata.scenario).toBeDefined();
      } finally {
        client.release();
      }
    });

    test('should seed test_scenarios with scenario metadata', async () => {
      const result = await seeder.seedTestScenarios(testScenarios);

      expect(result.tableName).toBe('test_scenarios');
      expect(result.recordsProcessed).toBe(testScenarios.length);
      expect(result.recordsInserted).toBe(testScenarios.length);

      // Verify test scenario data
      const client = await pool.connect();
      try {
        const records = await client.query('SELECT * FROM test_scenarios LIMIT 1');
        const record = records.rows[0];
        
        expect(record.scenario_name).toBeDefined();
        expect(record.description).toBeDefined();
        expect(record.expected_outcome).toBeDefined();
        expect(record.scenario_type).toBeDefined();
        expect(record.expected_flow).toBeDefined();
        
        // Verify expected_flow is valid JSON array (JSONB columns return objects directly)
        const expectedFlow = typeof record.expected_flow === 'string' ? JSON.parse(record.expected_flow) : record.expected_flow;
        expect(Array.isArray(expectedFlow)).toBe(true);
      } finally {
        client.release();
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle scenarios with missing optional data', async () => {
      // Find scenarios with missing optional data
      const noEmailScenario = testScenarios.find(s => s.applicant_data.email === null);
      const selfEmployedScenario = testScenarios.find(s => s.applicant_data.employment_status === 'self_employed');
      
      expect(noEmailScenario).toBeDefined();
      expect(selfEmployedScenario).toBeDefined();

      const results = await seeder.seedAllTables(testScenarios);
      
      // Should complete without errors
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      expect(totalErrors).toBe(0);
    });

    test('should handle identity verification failure scenarios correctly', async () => {
      const failureScenario = testScenarios.find(s => s.scenario_name === 'identity_verification_failure');
      expect(failureScenario).toBeDefined();

      const results = await seeder.seedAllTables([failureScenario!]);
      
      // Should seed the correct identity data for database verification
      const client = await pool.connect();
      try {
        const identityRecord = await client.query(
          'SELECT * FROM identity_records WHERE external_ref = $1',
          [failureScenario!.scenario_name]
        );
        
        expect(identityRecord.rows).toHaveLength(1);
        const record = identityRecord.rows[0];
        
        // Should use correct_date_of_birth for seeding
        // Convert database date to string for comparison
        const dbDate = record.dob instanceof Date ? record.dob.toISOString().split('T')[0] : record.dob;
        expect(dbDate).toBe(failureScenario!.applicant_data.correct_date_of_birth);
      } finally {
        client.release();
      }
    });

    test('should handle partial failure scenarios with attempt data', async () => {
      const partialFailureScenario = testScenarios.find(s => s.scenario_name === 'partial_identity_failure_then_success');
      expect(partialFailureScenario).toBeDefined();

      const results = await seeder.seedAllTables([partialFailureScenario!]);
      
      // Should complete without errors
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      expect(totalErrors).toBe(0);
    });

    test('should rollback transaction on database errors', async () => {
      // Create a scenario with invalid data to trigger database error
      const invalidScenario: TestScenario = {
        scenario_name: 'invalid_test',
        description: 'Test scenario with invalid data',
        applicant_data: {
          name: 'Test User',
          date_of_birth: 'invalid-date', // This should cause validation error
          ssn_last_four: '1234',
          monthly_income: 5000
        },
        expected_flow: ['identity_verification'],
        expected_outcome: 'failure'
      };

      // Should handle the error gracefully
      const result = await seeder.seedIdentityRecords([invalidScenario]);
      
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.recordsInserted).toBe(0);
    });
  });

  describe('Performance and Batch Processing', () => {
    test('should handle large datasets efficiently', async () => {
      const startTime = Date.now();
      
      await seeder.seedAllTables(testScenarios, {
        dryRun: false,
        batchSize: 50,
        skipValidation: false
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(10000); // 10 seconds
    });

    test('should support dry run mode', async () => {
      // Ensure clean database before dry run test
      await cleanupTestData();
      
      // Get initial count
      const client = await pool.connect();
      let initialCount: number;
      try {
        const countResult = await client.query('SELECT COUNT(*) FROM identity_records');
        initialCount = parseInt(countResult.rows[0].count);
      } finally {
        client.release();
      }

      const results = await seeder.seedAllTables(testScenarios, {
        dryRun: true,
        batchSize: 100,
        skipValidation: false
      });

      // Dry run should process scenarios but not insert records
      expect(results).toHaveLength(5);
      
      // Verify no actual data was inserted (count should remain the same)
      const client2 = await pool.connect();
      try {
        const finalCountResult = await client2.query('SELECT COUNT(*) FROM identity_records');
        const finalCount = parseInt(finalCountResult.rows[0].count);
        expect(finalCount).toBe(initialCount);
      } finally {
        client2.release();
      }
    });
  });

  // Helper function to clean up test data
  async function cleanupTestData(): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Delete in reverse dependency order
      await client.query('DELETE FROM test_scenarios');
      await client.query('DELETE FROM application_data');
      await client.query('DELETE FROM financial_data');
      await client.query('DELETE FROM contact_information');
      await client.query('DELETE FROM identity_records');
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
});