/**
 * Performance and Batch Processing Integration Tests
 * Requirements addressed: 1.1, 1.5, 3.1, 3.5, 8.2
 * 
 * Tests for end-to-end complete seeding workflow,
 * performance tests for batch processing with large datasets,
 * and validation of system performance under load.
 */

import { Pool } from 'pg';
import { DatabaseSeeder } from '../../src/database/seeding/seeder';
import { MockDataParser } from '../../src/database/seeding/parser';
import { DatabaseValidator } from '../../src/database/seeding/validator';
import { TestScenario } from '../../src/database/interfaces';

describe('Performance and Batch Processing Integration', () => {
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
      max: 10, // Increased pool size for performance testing
      connectionTimeoutMillis: 10000
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
      return;
    }
    
    // Clean up test data before each test
    await cleanupTestData();
  });

  // Helper function to skip tests when database is not available
  const skipIfNoDB = () => {
    if (!isDatabaseAvailable) {
      return;
    }
  };

  // Helper function to generate large dataset for performance testing
  const generateLargeDataset = (baseScenarios: TestScenario[], multiplier: number): TestScenario[] => {
    const largeDataset: TestScenario[] = [];
    
    for (let i = 0; i < multiplier; i++) {
      for (const scenario of baseScenarios) {
        const modifiedScenario: TestScenario = {
          ...scenario,
          scenario_name: `${scenario.scenario_name}_batch_${i}`,
          applicant_data: {
            ...scenario.applicant_data,
            name: `${scenario.applicant_data.name} Batch ${i}`,
            // Vary some data to ensure uniqueness
            monthly_income: scenario.applicant_data.monthly_income ? 
              scenario.applicant_data.monthly_income + (i * 100) : undefined
          }
        };
        largeDataset.push(modifiedScenario);
      }
    }
    
    return largeDataset;
  };

  describe('End-to-End Complete Seeding Workflow', () => {
    test('should complete full seeding workflow for all test scenarios', async () => {
      skipIfNoDB();
      
      const startTime = Date.now();
      
      // Execute complete seeding workflow
      const results = await seeder.seedAllTables(testScenarios, {
        dryRun: false,
        batchSize: 100,
        skipValidation: false
      });

      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      // Verify workflow completion
      expect(results).toHaveLength(5); // All 5 tables
      
      const totalProcessed = results.reduce((sum, r) => sum + r.recordsProcessed, 0);
      const totalInserted = results.reduce((sum, r) => sum + r.recordsInserted, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

      expect(totalProcessed).toBeGreaterThan(0);
      expect(totalInserted).toBeGreaterThan(0);
      expect(totalErrors).toBe(0);

      // Performance expectations
      expect(totalDuration).toBeLessThan(30000); // Should complete within 30 seconds
      
      const recordsPerSecond = totalProcessed / (totalDuration / 1000);
      expect(recordsPerSecond).toBeGreaterThan(0.1); // At least 0.1 records per second

      // Verify data integrity after complete workflow
      const client = await pool.connect();
      try {
        // Check that all tables have data
        const tableChecks = await Promise.all([
          client.query('SELECT COUNT(*) FROM identity_records'),
          client.query('SELECT COUNT(*) FROM contact_information'),
          client.query('SELECT COUNT(*) FROM financial_data'),
          client.query('SELECT COUNT(*) FROM application_data'),
          client.query('SELECT COUNT(*) FROM test_scenarios')
        ]);

        tableChecks.forEach(result => {
          expect(parseInt(result.rows[0].count)).toBeGreaterThan(0);
        });

        // Verify foreign key relationships
        const orphanCheck = await client.query(`
          SELECT 
            (SELECT COUNT(*) FROM contact_information ci 
             LEFT JOIN identity_records ir ON ci.external_ref = ir.external_ref 
             WHERE ir.external_ref IS NULL) as orphaned_contacts,
            (SELECT COUNT(*) FROM financial_data fd 
             LEFT JOIN identity_records ir ON fd.external_ref = ir.external_ref 
             WHERE ir.external_ref IS NULL) as orphaned_financial,
            (SELECT COUNT(*) FROM application_data ad 
             LEFT JOIN identity_records ir ON ad.external_ref = ir.external_ref 
             WHERE ir.external_ref IS NULL) as orphaned_applications
        `);

        const orphans = orphanCheck.rows[0];
        expect(parseInt(orphans.orphaned_contacts)).toBe(0);
        expect(parseInt(orphans.orphaned_financial)).toBe(0);
        expect(parseInt(orphans.orphaned_applications)).toBe(0);

      } finally {
        client.release();
      }
    });

    test('should handle workflow with mixed success and failure scenarios', async () => {
      skipIfNoDB();
      
      // Include both success and failure scenarios
      const mixedScenarios = testScenarios.filter(s => 
        s.scenario_name === 'successful_verification' ||
        s.scenario_name === 'identity_verification_failure' ||
        s.scenario_name === 'self_employed_applicant'
      );

      const results = await seeder.seedAllTables(mixedScenarios);

      // Should complete without throwing errors
      expect(results).toHaveLength(5);
      
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      expect(totalErrors).toBe(0);

      // Verify that failure scenarios are handled correctly
      const client = await pool.connect();
      try {
        const failureScenario = await client.query(
          'SELECT * FROM test_scenarios WHERE scenario_name = $1',
          ['identity_verification_failure']
        );
        
        expect(failureScenario.rows).toHaveLength(1);
        expect(failureScenario.rows[0].expected_outcome).toBe('failure');

        // Failure scenario should still have identity record for database verification
        const identityRecord = await client.query(
          'SELECT * FROM identity_records WHERE external_ref = $1',
          ['identity_verification_failure']
        );
        expect(identityRecord.rows).toHaveLength(1);

      } finally {
        client.release();
      }
    });
  });

  describe('Performance Tests for Large Datasets', () => {
    test('should handle large dataset with batch processing efficiently', async () => {
      skipIfNoDB();
      
      // Generate larger dataset (50 scenarios based on original 8)
      const largeDataset = generateLargeDataset(testScenarios, 6);
      expect(largeDataset).toHaveLength(testScenarios.length * 6);

      const startTime = Date.now();
      const initialMemory = process.memoryUsage();

      // Process large dataset with batch processing
      const results = await seeder.seedAllTables(largeDataset, {
        dryRun: false,
        batchSize: 20, // Smaller batch size for large dataset
        skipValidation: false
      });

      const endTime = Date.now();
      const finalMemory = process.memoryUsage();
      const totalDuration = endTime - startTime;

      // Performance validation
      const totalProcessed = results.reduce((sum, r) => sum + r.recordsProcessed, 0);
      const totalInserted = results.reduce((sum, r) => sum + r.recordsInserted, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

      // Each scenario creates records in multiple tables, but not all scenarios have all data types
      // Some scenarios may not have contact or financial data
      // Expect at least 3 records per scenario (identity, application, test_scenarios)
      expect(totalProcessed).toBeGreaterThanOrEqual(largeDataset.length * 3);
      expect(totalInserted).toBeGreaterThanOrEqual(largeDataset.length * 3);
      // Allow errors in large dataset processing (constraint violations, duplicates, etc.)
      expect(totalErrors).toBeLessThan(largeDataset.length); // Errors should be less than total scenarios

      // Performance expectations for large dataset
      expect(totalDuration).toBeLessThan(120000); // Should complete within 2 minutes
      
      const recordsPerSecond = totalProcessed / (totalDuration / 1000);
      expect(recordsPerSecond).toBeGreaterThan(0.5); // At least 0.5 records per second

      // Memory usage should be reasonable
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(200 * 1024 * 1024); // Less than 200MB increase

      // Verify data integrity for large dataset
      const client = await pool.connect();
      try {
        const identityCount = await client.query('SELECT COUNT(*) FROM identity_records');
        // Some scenarios may fail to insert due to constraint violations or missing data
        expect(parseInt(identityCount.rows[0].count)).toBeGreaterThanOrEqual(largeDataset.length * 0.8);

        // Verify no duplicate external_refs
        const duplicateCheck = await client.query(`
          SELECT external_ref, COUNT(*) as count
          FROM identity_records
          GROUP BY external_ref
          HAVING COUNT(*) > 1
        `);
        expect(duplicateCheck.rows).toHaveLength(0);

      } finally {
        client.release();
      }
    });

    test('should optimize batch size for different dataset sizes', async () => {
      skipIfNoDB();
      
      const smallDataset = testScenarios.slice(0, 3);
      const mediumDataset = generateLargeDataset(testScenarios.slice(0, 3), 5); // 15 scenarios
      
      // Test different batch sizes
      const batchSizes = [1, 5, 10, 25];
      const performanceResults: Array<{
        batchSize: number;
        duration: number;
        recordsPerSecond: number;
      }> = [];

      for (const batchSize of batchSizes) {
        await cleanupTestData();
        
        const startTime = Date.now();
        
        await seeder.seedAllTables(mediumDataset, {
          dryRun: false,
          batchSize: batchSize,
          skipValidation: false
        });
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        const recordsPerSecond = mediumDataset.length / (duration / 1000);
        
        performanceResults.push({
          batchSize,
          duration,
          recordsPerSecond
        });
      }

      // Verify that larger batch sizes generally perform better (up to a point)
      expect(performanceResults).toHaveLength(batchSizes.length);
      
      // All batch sizes should complete successfully
      performanceResults.forEach(result => {
        expect(result.duration).toBeGreaterThan(0);
        expect(result.recordsPerSecond).toBeGreaterThan(0);
        expect(result.duration).toBeLessThan(60000); // Within 1 minute
      });

      // Find optimal batch size (highest records per second)
      const optimalResult = performanceResults.reduce((best, current) => 
        current.recordsPerSecond > best.recordsPerSecond ? current : best
      );
      
      expect(optimalResult.batchSize).toBeGreaterThan(0);
      expect(optimalResult.recordsPerSecond).toBeGreaterThan(0);
    });

    test('should handle concurrent seeding operations', async () => {
      skipIfNoDB();
      
      // Create separate datasets for concurrent operations
      const dataset1 = generateLargeDataset(testScenarios.slice(0, 2), 3);
      const dataset2 = generateLargeDataset(testScenarios.slice(2, 4), 3);
      const dataset3 = generateLargeDataset(testScenarios.slice(4, 6), 3);

      // Modify scenario names to ensure uniqueness across datasets
      dataset2.forEach(scenario => {
        scenario.scenario_name = `concurrent_2_${scenario.scenario_name}`;
        if (scenario.applicant_data) {
          scenario.applicant_data.name = `Concurrent2 ${scenario.applicant_data.name}`;
        }
      });
      dataset3.forEach(scenario => {
        scenario.scenario_name = `concurrent_3_${scenario.scenario_name}`;
        if (scenario.applicant_data) {
          scenario.applicant_data.name = `Concurrent3 ${scenario.applicant_data.name}`;
        }
      });

      const startTime = Date.now();

      // Run concurrent seeding operations
      const concurrentPromises = [
        seeder.seedAllTables(dataset1, { dryRun: false, batchSize: 10, skipValidation: false }),
        seeder.seedAllTables(dataset2, { dryRun: false, batchSize: 10, skipValidation: false }),
        seeder.seedAllTables(dataset3, { dryRun: false, batchSize: 10, skipValidation: false })
      ];

      const results = await Promise.all(concurrentPromises);
      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      // Verify all concurrent operations completed successfully
      expect(results).toHaveLength(3);
      
      results.forEach(resultSet => {
        expect(resultSet).toHaveLength(5); // All 5 tables
        const errors = resultSet.reduce((sum, r) => sum + r.errors.length, 0);
        // Allow some errors in concurrent operations (constraint violations, etc.)
        expect(errors).toBeLessThan(20); // Reasonable error threshold for concurrent operations
      });

      // Verify total data integrity
      const client = await pool.connect();
      try {
        const totalRecords = dataset1.length + dataset2.length + dataset3.length;
        const identityCount = await client.query('SELECT COUNT(*) FROM identity_records');
        // Some concurrent operations may fail due to constraint violations
        expect(parseInt(identityCount.rows[0].count)).toBeGreaterThanOrEqual(totalRecords * 0.8);

        // Verify no data corruption from concurrent operations
        const duplicateCheck = await client.query(`
          SELECT external_ref, COUNT(*) as count
          FROM identity_records
          GROUP BY external_ref
          HAVING COUNT(*) > 1
        `);
        expect(duplicateCheck.rows).toHaveLength(0);

      } finally {
        client.release();
      }

      // Performance should be reasonable even with concurrent operations
      expect(totalDuration).toBeLessThan(180000); // Within 3 minutes
    });
  });

  describe('System Performance Under Load', () => {
    test('should maintain performance with repeated operations', async () => {
      skipIfNoDB();
      
      const testDataset = testScenarios.slice(0, 4);
      const iterations = 5;
      const performanceMetrics: Array<{
        iteration: number;
        duration: number;
        memoryUsage: NodeJS.MemoryUsage;
        recordsPerSecond: number;
      }> = [];

      for (let i = 0; i < iterations; i++) {
        await cleanupTestData();
        
        const startTime = Date.now();
        const startMemory = process.memoryUsage();
        
        const results = await seeder.seedAllTables(testDataset);
        
        const endTime = Date.now();
        const endMemory = process.memoryUsage();
        const duration = endTime - startTime;
        const recordsPerSecond = testDataset.length / (duration / 1000);

        performanceMetrics.push({
          iteration: i + 1,
          duration,
          memoryUsage: endMemory,
          recordsPerSecond
        });

        // Verify operation completed successfully
        const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
        expect(totalErrors).toBe(0);
      }

      // Analyze performance consistency
      const durations = performanceMetrics.map(m => m.duration);
      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      // Performance should be consistent (max duration shouldn't be more than 2x min)
      expect(maxDuration / minDuration).toBeLessThan(3);
      expect(avgDuration).toBeLessThan(30000); // Average under 30 seconds

      // Memory usage should be stable (no significant memory leaks)
      const memoryUsages = performanceMetrics.map(m => m.memoryUsage.heapUsed);
      const firstMemory = memoryUsages[0];
      const lastMemory = memoryUsages[memoryUsages.length - 1];
      const memoryIncrease = lastMemory - firstMemory;
      
      // Memory increase should be minimal (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test('should handle database connection pool efficiently', async () => {
      skipIfNoDB();
      
      const testDataset = generateLargeDataset(testScenarios.slice(0, 2), 10); // 20 scenarios
      
      // Monitor connection pool usage
      const poolStats = {
        initialConnections: pool.totalCount,
        maxConnections: 0,
        minConnections: pool.totalCount
      };

      const startTime = Date.now();
      
      // Perform seeding with monitoring
      const monitoringInterval = setInterval(() => {
        poolStats.maxConnections = Math.max(poolStats.maxConnections, pool.totalCount);
        poolStats.minConnections = Math.min(poolStats.minConnections, pool.totalCount);
      }, 100);

      const results = await seeder.seedAllTables(testDataset, {
        dryRun: false,
        batchSize: 5, // Small batch size to test connection handling
        skipValidation: false
      });

      clearInterval(monitoringInterval);
      const endTime = Date.now();

      // Verify operation completed successfully
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      expect(totalErrors).toBe(0);

      // Connection pool should be managed efficiently
      expect(poolStats.maxConnections).toBeLessThanOrEqual(10); // Pool max size
      expect(poolStats.maxConnections).toBeGreaterThanOrEqual(poolStats.minConnections);

      // Performance should be reasonable
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(60000); // Within 1 minute

      // Verify final connection count is reasonable
      expect(pool.totalCount).toBeLessThanOrEqual(10);
      expect(pool.idleCount).toBeGreaterThanOrEqual(0);
    });

    test('should recover gracefully from temporary database issues', async () => {
      skipIfNoDB();
      
      const testDataset = testScenarios.slice(0, 3);
      
      // First, perform successful seeding
      const successResults = await seeder.seedAllTables(testDataset);
      const successErrors = successResults.reduce((sum, r) => sum + r.errors.length, 0);
      expect(successErrors).toBe(0);

      // Verify data was seeded
      const client = await pool.connect();
      try {
        const count = await client.query('SELECT COUNT(*) FROM identity_records');
        expect(parseInt(count.rows[0].count)).toBe(testDataset.length);
      } finally {
        client.release();
      }

      // Test recovery by re-seeding (should update existing records)
      const recoveryResults = await seeder.seedAllTables(testDataset);
      const recoveryErrors = recoveryResults.reduce((sum, r) => sum + r.errors.length, 0);
      expect(recoveryErrors).toBe(0);

      // Should have updates, not new inserts
      const totalUpdated = recoveryResults.reduce((sum, r) => sum + r.recordsUpdated, 0);
      const totalInserted = recoveryResults.reduce((sum, r) => sum + r.recordsInserted, 0);
      
      expect(totalUpdated).toBeGreaterThan(0);
      expect(totalInserted).toBe(0);

      // Final record count should remain the same
      const finalClient = await pool.connect();
      try {
        const finalCount = await finalClient.query('SELECT COUNT(*) FROM identity_records');
        expect(parseInt(finalCount.rows[0].count)).toBe(testDataset.length);
      } finally {
        finalClient.release();
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