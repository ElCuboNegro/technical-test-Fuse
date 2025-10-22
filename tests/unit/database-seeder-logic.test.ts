/**
 * Database Seeder Logic Unit Tests
 * Requirements addressed: 1.4, 1.5, 7.6
 * 
 * Tests for DatabaseSeeder business logic, error handling, and data transformation
 * without requiring live database connection.
 */

import { Pool } from 'pg';
import { DatabaseSeeder } from '../../src/database/seeding/seeder';
import { MockDataParser } from '../../src/database/seeding/parser';
import { TestScenario, SeedingOptions } from '../../src/database/interfaces';

// Mock the Pool to avoid database connection
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    end: jest.fn(),
    query: jest.fn()
  }))
}));

describe('Database Seeder Logic Tests', () => {
  let mockPool: jest.Mocked<Pool>;
  let seeder: DatabaseSeeder;
  let parser: MockDataParser;
  let testScenarios: TestScenario[];
  let mockClient: any;

  beforeAll(async () => {
    parser = new MockDataParser();
    testScenarios = await parser.parseTestScenarios();
  });

  beforeEach(() => {
    // Create mock client
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    // Create mock pool
    mockPool = new Pool() as jest.Mocked<Pool>;
    mockPool.connect = jest.fn().mockResolvedValue(mockClient);
    mockPool.end = jest.fn().mockResolvedValue(undefined);

    seeder = new DatabaseSeeder(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Identity Records Seeding Logic', () => {
    test('should process identity records with correct data structure', async () => {
      // Mock successful database operations
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'test-id', external_ref: 'test-scenario', inserted: true }] }) // INSERT
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await seeder.seedIdentityRecords(testScenarios.slice(0, 1));

      expect(result.tableName).toBe('identity_records');
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(1);
      expect(result.recordsUpdated).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify database calls
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO identity_records'),
        expect.any(Array)
      );
    });

    test('should handle identity verification failure scenarios correctly', async () => {
      const failureScenario = testScenarios.find(s => s.scenario_name === 'identity_verification_failure');
      expect(failureScenario).toBeDefined();

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'test-id', external_ref: 'identity_verification_failure', inserted: true }] })
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await seeder.seedIdentityRecords([failureScenario!]);

      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(1);
      expect(result.errors).toHaveLength(0);

      // Verify the correct identity data was used (not the provided incorrect data)
      const insertCall = mockClient.query.mock.calls.find(call =>
        call[0] && call[0].includes('INSERT INTO identity_records')
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1]).toContain(failureScenario!.applicant_data.correct_date_of_birth);
    });

    test('should handle database errors gracefully', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error('Database connection failed')) // INSERT fails
        .mockResolvedValueOnce(undefined); // COMMIT (individual errors don't rollback)

      const result = await seeder.seedIdentityRecords(testScenarios.slice(0, 1));

      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Database connection failed');

      // Individual record errors don't cause rollback, only transaction-level errors do
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    test('should handle invalid identity data', async () => {
      const invalidScenario: TestScenario = {
        scenario_name: 'invalid_test',
        description: 'Test with invalid data',
        applicant_data: {
          name: 'Test User',
          date_of_birth: 'invalid-date',
          ssn_last_four: '123', // Invalid format
          monthly_income: 5000
        },
        expected_flow: ['identity_verification'],
        expected_outcome: 'failure'
      };

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await seeder.seedIdentityRecords([invalidScenario]);

      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Invalid');
    });
  });

  describe('Contact Information Seeding Logic', () => {
    test('should process contact information correctly', async () => {
      const scenarioWithContact = testScenarios.find(s => s.applicant_data.mailing_address);
      expect(scenarioWithContact).toBeDefined();

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'test-id', external_ref: 'test-scenario', inserted: true }] })
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await seeder.seedContactInformation([scenarioWithContact!]);

      expect(result.tableName).toBe('contact_information');
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    test('should skip scenarios without contact data', async () => {
      const scenarioWithoutContact: TestScenario = {
        scenario_name: 'no_contact_test',
        description: 'Test without contact data',
        applicant_data: {
          name: 'Test User',
          date_of_birth: '1990-01-01',
          ssn_last_four: '1234',
          monthly_income: 5000
        },
        expected_flow: ['identity_verification'],
        expected_outcome: 'success'
      };

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await seeder.seedContactInformation([scenarioWithoutContact]);

      expect(result.recordsProcessed).toBe(0);
      expect(result.recordsInserted).toBe(0);
    });

    test('should handle complete_address scenarios', async () => {
      const unitScenario = testScenarios.find(s => s.applicant_data.complete_address);
      if (unitScenario) {
        mockClient.query
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'test-id', external_ref: unitScenario.scenario_name, inserted: true }] })
          .mockResolvedValueOnce(undefined); // COMMIT

        const result = await seeder.seedContactInformation([unitScenario]);

        expect(result.recordsProcessed).toBe(1);
        expect(result.recordsInserted).toBe(1);

        // Verify complete address data was used
        const insertCall = mockClient.query.mock.calls.find(call =>
          call[0] && call[0].includes('INSERT INTO contact_information')
        );
        expect(insertCall).toBeDefined();
        expect(insertCall![1]).toContain(unitScenario.applicant_data.complete_address!.street);
      }
    });
  });

  describe('Financial Data Seeding Logic', () => {
    test('should process financial data correctly', async () => {
      const scenarioWithFinancial = testScenarios.find(s => s.applicant_data.monthly_income !== undefined);
      expect(scenarioWithFinancial).toBeDefined();

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'test-id', external_ref: 'test-scenario', inserted: true }] })
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await seeder.seedFinancialData([scenarioWithFinancial!]);

      expect(result.tableName).toBe('financial_data');
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    test('should handle self-employed scenarios', async () => {
      const selfEmployedScenario = testScenarios.find(s => s.applicant_data.employment_status === 'self_employed');
      if (selfEmployedScenario) {
        mockClient.query
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'test-id', external_ref: selfEmployedScenario.scenario_name, inserted: true }] })
          .mockResolvedValueOnce(undefined); // COMMIT

        const result = await seeder.seedFinancialData([selfEmployedScenario]);

        expect(result.recordsProcessed).toBe(1);
        expect(result.recordsInserted).toBe(1);

        // Verify self-employed status was preserved
        const insertCall = mockClient.query.mock.calls.find(call =>
          call[0] && call[0].includes('INSERT INTO financial_data')
        );
        expect(insertCall).toBeDefined();
        expect(insertCall![1]).toContain('self_employed');
      }
    });

    test('should skip scenarios without financial data', async () => {
      const scenarioWithoutFinancial: TestScenario = {
        scenario_name: 'no_financial_test',
        description: 'Test without financial data',
        applicant_data: {
          name: 'Test User',
          date_of_birth: '1990-01-01',
          ssn_last_four: '1234'
        },
        expected_flow: ['identity_verification'],
        expected_outcome: 'success'
      };

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await seeder.seedFinancialData([scenarioWithoutFinancial]);

      expect(result.recordsProcessed).toBe(0);
      expect(result.recordsInserted).toBe(0);
    });
  });

  describe('Application Data Seeding Logic', () => {
    test('should process application data correctly', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'test-id', external_ref: 'test-scenario', inserted: true }] })
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await seeder.seedApplicationData(testScenarios.slice(0, 1));

      expect(result.tableName).toBe('application_data');
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(1);
      expect(result.errors).toHaveLength(0);

      // Verify metadata structure
      const insertCall = mockClient.query.mock.calls.find(call =>
        call[0] && call[0].includes('INSERT INTO application_data')
      );
      expect(insertCall).toBeDefined();

      const metadata = JSON.parse(insertCall![1][4]); // metadata is 5th parameter
      expect(metadata.test).toBe(true);
      expect(metadata.scenario).toBeDefined();
      expect(metadata.expected_outcome).toBeDefined();
    });

    test('should set correct status based on expected outcome', async () => {
      const failureScenario = testScenarios.find(s => s.expected_outcome === 'failure');
      if (failureScenario) {
        mockClient.query
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'test-id', external_ref: failureScenario.scenario_name, inserted: true }] })
          .mockResolvedValueOnce(undefined); // COMMIT

        const result = await seeder.seedApplicationData([failureScenario]);

        expect(result.recordsProcessed).toBe(1);
        expect(result.recordsInserted).toBe(1);

        // Verify status is set to 'rejected' for failure scenarios
        const insertCall = mockClient.query.mock.calls.find(call =>
          call[0] && call[0].includes('INSERT INTO application_data')
        );
        expect(insertCall).toBeDefined();
        expect(insertCall![1]).toContain('rejected');
      }
    });
  });

  describe('Test Scenarios Seeding Logic', () => {
    test('should process test scenarios correctly', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'test-id', scenario_name: 'test-scenario', inserted: true }] })
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await seeder.seedTestScenarios(testScenarios.slice(0, 1));

      expect(result.tableName).toBe('test_scenarios');
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(1);
      expect(result.errors).toHaveLength(0);

      // Verify expected_flow is stored as JSON
      const insertCall = mockClient.query.mock.calls.find(call =>
        call[0] && call[0].includes('INSERT INTO test_scenarios')
      );
      expect(insertCall).toBeDefined();

      const expectedFlow = JSON.parse(insertCall![1][4]); // expected_flow is 5th parameter
      expect(Array.isArray(expectedFlow)).toBe(true);
    });

    test('should determine scenario types correctly', async () => {
      const scenarios = [
        { name: 'identity_verification_failure', expectedType: 'identity_failure' },
        { name: 'job_tenure_discrepancy', expectedType: 'tenure_discrepancy' },
        { name: 'self_employed_applicant', expectedType: 'self_employed' },
        { name: 'address_with_unit_clarification', expectedType: 'address_clarification' },
        { name: 'partial_identity_failure_then_success', expectedType: 'partial_failure' },
        { name: 'successful_verification', expectedType: 'standard' }
      ];

      for (const { name, expectedType } of scenarios) {
        const scenario = testScenarios.find(s => s.scenario_name === name);
        if (scenario) {
          mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'test-id', scenario_name: scenario.scenario_name }] })
            .mockResolvedValueOnce(undefined); // COMMIT

          await seeder.seedTestScenarios([scenario]);

          const insertCall = mockClient.query.mock.calls.find(call =>
            call[0] && call[0].includes('INSERT INTO test_scenarios')
          );
          expect(insertCall).toBeDefined();
          expect(insertCall![1]).toContain(expectedType);

          jest.clearAllMocks();
        }
      }
    });
  });

  describe('Comprehensive Seeding Logic', () => {
    test('should coordinate all table seeding in correct order', async () => {
      // Mock all database operations as successful
      mockClient.query.mockResolvedValue({ rowCount: 1, rows: [{ id: 'test-id' }] });

      const options: SeedingOptions = {
        dryRun: false,
        batchSize: 100,
        skipValidation: false
      };

      const results = await seeder.seedAllTables(testScenarios.slice(0, 2), options);

      expect(results).toHaveLength(5);
      expect(results.map(r => r.tableName)).toEqual([
        'identity_records',
        'contact_information',
        'financial_data',
        'application_data',
        'test_scenarios'
      ]);

      // Verify each table was processed
      results.forEach(result => {
        expect(result.recordsProcessed).toBeGreaterThanOrEqual(0);
        expect(result.errors).toHaveLength(0);
      });
    });

    test('should handle dry run mode', async () => {
      // For dry run, we would expect different behavior
      // This test verifies the structure is correct for dry run implementation
      const options: SeedingOptions = {
        dryRun: true,
        batchSize: 100,
        skipValidation: false
      };

      // Mock successful operations (dry run would still call database for validation)
      mockClient.query.mockResolvedValue({ rowCount: 1, rows: [{ id: 'test-id' }] });

      const results = await seeder.seedAllTables(testScenarios.slice(0, 1), options);

      expect(results).toHaveLength(5);
      // In actual implementation, dry run would show 0 records inserted
      // but still process the scenarios for validation
    });

    test('should handle batch processing options', async () => {
      const options: SeedingOptions = {
        dryRun: false,
        batchSize: 2, // Small batch size
        skipValidation: true
      };

      mockClient.query.mockResolvedValue({ rowCount: 1, rows: [{ id: 'test-id' }] });

      const results = await seeder.seedAllTables(testScenarios.slice(0, 3), options);

      expect(results).toHaveLength(5);
      // Verify batch processing doesn't affect final results
      results.forEach(result => {
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  describe('Upsert Logic Simulation', () => {
    test('should handle insert vs update logic', async () => {
      // First call - simulate insert (rowCount = 1, new record)
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'new-id', external_ref: 'test-scenario', inserted: true }] }) // INSERT
        .mockResolvedValueOnce(undefined); // COMMIT

      const firstResult = await seeder.seedIdentityRecords(testScenarios.slice(0, 1));
      expect(firstResult.recordsInserted).toBe(1);
      expect(firstResult.recordsUpdated).toBe(0);

      jest.clearAllMocks();

      // Second call - simulate update (rowCount = 1, existing record updated)
      // In real implementation, ON CONFLICT DO UPDATE would be used
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'existing-id', external_ref: 'test-scenario', inserted: false }] }) // UPDATE
        .mockResolvedValueOnce(undefined); // COMMIT

      const secondResult = await seeder.seedIdentityRecords(testScenarios.slice(0, 1));
      // Note: The actual upsert logic would need to track whether it's insert or update
      // This test verifies the structure supports both operations
      expect(secondResult.recordsProcessed).toBe(1);
      expect(secondResult.recordsUpdated).toBe(1);
      expect(secondResult.recordsInserted).toBe(0);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should rollback on transaction errors', async () => {
      // Mock a transaction-level error (like connection failure during COMMIT)
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'test-id' }] }) // INSERT succeeds
        .mockRejectedValueOnce(new Error('Connection lost during commit')); // COMMIT fails

      await expect(seeder.seedIdentityRecords(testScenarios.slice(0, 1)))
        .rejects.toThrow('Connection lost during commit');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('should collect and report individual record errors', async () => {
      // Mix of successful and failed operations
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'success-1', inserted: true }] }) // First record succeeds
        .mockRejectedValueOnce(new Error('Duplicate key')) // Second record fails
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'success-2', inserted: true }] }) // Third record succeeds
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await seeder.seedIdentityRecords(testScenarios.slice(0, 3));

      expect(result.recordsProcessed).toBe(3);
      expect(result.recordsInserted).toBe(2); // 2 successful
      expect(result.errors.length).toBe(1); // 1 failed
      expect(result.errors[0]).toContain('Duplicate key');
    });

    test('should handle connection pool errors', async () => {
      // Mock pool connection failure
      (mockPool.connect as jest.MockedFunction<typeof mockPool.connect>).mockRejectedValueOnce(new Error('Connection pool exhausted'));

      await expect(seeder.seedIdentityRecords(testScenarios.slice(0, 1)))
        .rejects.toThrow('Connection pool exhausted');
    });
  });
});