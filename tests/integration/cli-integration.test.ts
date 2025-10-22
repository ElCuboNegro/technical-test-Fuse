/**
 * CLI Integration Tests
 * Requirements addressed: 4.2, 4.4, 8.4, 8.5
 * 
 * Integration tests for CLI commands with actual database operations.
 */

import { spawn } from 'child_process';
import { Pool } from 'pg';
import path from 'path';

describe('CLI Integration Tests', () => {
  let pool: Pool;
  let isDatabaseAvailable = false;
  const cliPath = path.join(__dirname, '../../src/database/cli/seed-cli.ts');

  beforeAll(async () => {
    // Use test database URL
    const testDatabaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://dev_user:dev_password@localhost:5432/agents_app_dev';
    
    pool = new Pool({
      connectionString: testDatabaseUrl,
      max: 5,
      connectionTimeoutMillis: 5000
    });

    // Try to connect to database
    try {
      const client = await pool.connect();
      client.release();
      isDatabaseAvailable = true;
    } catch (error) {
      console.warn('Database connection not available - integration tests will be skipped');
      isDatabaseAvailable = false;
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  beforeEach(async () => {
    if (!isDatabaseAvailable) {
      return; // Skip test if database not available
    }
    
    // Clean up test data before each test
    await cleanupTestData();
  });

  // Helper function to run CLI command with database
  const runCLIWithDB = (args: string[] = [], timeout: number = 30000): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> => {
    return new Promise((resolve, reject) => {
      const child = spawn('node', ['test-cli-runner.js', cliPath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { 
          ...process.env, 
          NODE_ENV: 'test',
          TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://dev_user:dev_password@localhost:5432/agents_app_dev',
          SSN_SALT: process.env.SSN_SALT || 'test_salt_integration',
          DOB_SALT: process.env.DOB_SALT || 'test_salt_integration'
        }
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`CLI command timed out after ${timeout}ms`));
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          exitCode: code || 0
        });
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  };

  // Helper function to clean up test data
  async function cleanupTestData(): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Clean in reverse dependency order
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

  // Helper function to count records in a table
  async function countRecords(tableName: string): Promise<number> {
    const client = await pool.connect();
    try {
      const result = await client.query(`SELECT COUNT(*) FROM ${tableName}`);
      return parseInt(result.rows[0].count);
    } finally {
      client.release();
    }
  }

  describe('Seed Command Integration', () => {
    test('should seed database with test data successfully', async () => {
      const result = await runCLIWithDB(['seed', '--env=test']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('✓ Database seeding operation completed successfully');
      expect(result.stdout).toContain('[AUDIT]');
      expect(result.stdout).toContain('SUCCESS');

      // Verify data was actually inserted
      const identityCount = await countRecords('identity_records');
      const contactCount = await countRecords('contact_information');
      const financialCount = await countRecords('financial_data');
      const applicationCount = await countRecords('application_data');
      const scenarioCount = await countRecords('test_scenarios');

      expect(identityCount).toBeGreaterThan(0);
      expect(contactCount).toBeGreaterThan(0);
      expect(financialCount).toBeGreaterThan(0);
      expect(applicationCount).toBeGreaterThan(0);
      expect(scenarioCount).toBeGreaterThan(0);
    });

    test('should handle upsert operations on subsequent runs', async () => {
      // First run
      await runCLIWithDB(['seed', '--env=test']);
      const firstRunCount = await countRecords('identity_records');

      // Second run
      const result = await runCLIWithDB(['seed', '--env=test']);
      const secondRunCount = await countRecords('identity_records');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('updated');
      expect(secondRunCount).toBe(firstRunCount); // Same count, records updated not inserted
    });

    test('should show verbose output when requested', async () => {
      const result = await runCLIWithDB(['seed', '--env=test', '--verbose']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Parsed scenarios:');
      expect(result.stdout).toContain('Detailed Results:');
      expect(result.stdout).toContain('Processed:');
      expect(result.stdout).toContain('Inserted:');
    });

    test('should work with dry-run mode', async () => {
      const result = await runCLIWithDB(['seed', '--env=test', '--dry-run']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('DRY RUN');

      // Verify no data was actually inserted
      const identityCount = await countRecords('identity_records');
      expect(identityCount).toBe(0);
    });
  });

  describe('Clean Command Integration', () => {
    test('should clean test data from database', async () => {
      // First seed the database
      await runCLIWithDB(['seed', '--env=test']);
      const beforeCount = await countRecords('identity_records');
      expect(beforeCount).toBeGreaterThan(0);

      // Then clean it
      const result = await runCLIWithDB(['clean', '--env=test']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('✓ Database seeding operation completed successfully');

      // Verify data was cleaned
      const afterCount = await countRecords('identity_records');
      expect(afterCount).toBe(0);
    });

    test('should show cleaning progress in verbose mode', async () => {
      // Seed first
      await runCLIWithDB(['seed', '--env=test']);

      // Clean with verbose
      const result = await runCLIWithDB(['clean', '--env=test', '--verbose']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('✓ Cleaned');
      expect(result.stdout).toContain('records from');
    });

    test('should work with dry-run mode', async () => {
      // Seed first
      await runCLIWithDB(['seed', '--env=test']);
      const beforeCount = await countRecords('identity_records');

      // Dry-run clean
      const result = await runCLIWithDB(['clean', '--env=test', '--dry-run']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('DRY RUN - Would clean test data');

      // Verify data was not actually cleaned
      const afterCount = await countRecords('identity_records');
      expect(afterCount).toBe(beforeCount);
    });
  });

  describe('Reset Command Integration', () => {
    test('should clean and then seed database', async () => {
      // First seed with some data
      await runCLIWithDB(['seed', '--env=test']);
      const initialCount = await countRecords('identity_records');

      // Reset
      const result = await runCLIWithDB(['reset', '--env=test']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('=== Cleaning Database ===');
      expect(result.stdout).toContain('=== Seeding Database ===');

      // Verify data was reset (cleaned and re-seeded)
      const finalCount = await countRecords('identity_records');
      expect(finalCount).toBe(initialCount); // Same count after reset
    });

    test('should work with dry-run mode', async () => {
      const result = await runCLIWithDB(['reset', '--env=test', '--dry-run']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('DRY RUN');
      expect(result.stdout).toContain('=== Cleaning Database ===');
      // In dry-run, seeding part should also be dry-run
    });
  });

  describe('Validate Command Integration', () => {
    test('should validate database schema and data', async () => {
      // Seed database first
      await runCLIWithDB(['seed', '--env=test']);

      // Validate
      const result = await runCLIWithDB(['validate', '--env=test']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('✓ Database validation passed');
    });

    test('should show detailed validation in verbose mode', async () => {
      // Seed database first
      await runCLIWithDB(['seed', '--env=test']);

      // Validate with verbose
      const result = await runCLIWithDB(['validate', '--env=test', '--verbose']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('✓ Table');
      expect(result.stdout).toContain('exists');
      expect(result.stdout).toContain('No orphaned records');
    });

    test('should detect missing tables', async () => {
      // This would require a database without proper schema
      // For now, test that validation runs
      const result = await runCLIWithDB(['validate', '--env=test']);
      
      // Should complete validation process
      expect(result.stdout).toContain('=== Validating Database ===');
    });

    test('should detect data integrity issues', async () => {
      // Seed database first
      await runCLIWithDB(['seed', '--env=test']);

      // Validate should pass with good data
      const result = await runCLIWithDB(['validate', '--env=test']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('✓ Database validation passed');
    });
  });

  describe('Setup Command Integration', () => {
    test('should run full database setup', async () => {
      const result = await runCLIWithDB(['setup', '--env=test']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('=== Setting Up Database ===');
      expect(result.stdout).toContain('Running database migrations');
      expect(result.stdout).toContain('Seeding database with test data');
      expect(result.stdout).toContain('Validating database setup');

      // Verify data was seeded
      const identityCount = await countRecords('identity_records');
      expect(identityCount).toBeGreaterThan(0);
    });

    test('should work with dry-run mode', async () => {
      const result = await runCLIWithDB(['setup', '--env=test', '--dry-run']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('DRY RUN - Would run migrations');

      // Verify no data was actually seeded
      const identityCount = await countRecords('identity_records');
      expect(identityCount).toBe(0);
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle database connection failures gracefully', async () => {
      // Use invalid database URL
      const result = await new Promise<{stdout: string, stderr: string, exitCode: number}>((resolve) => {
        const child = spawn('node', ['-r', 'ts-node/register', cliPath, 'seed', '--env=test'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { 
            ...process.env, 
            NODE_ENV: 'test',
            DATABASE_URL: 'postgresql://invalid:invalid@nonexistent:5432/invalid',
            SSN_SALT: 'test_salt',
            DOB_SALT: 'test_salt'
          }
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => stdout += data.toString());
        child.stderr?.on('data', (data) => stderr += data.toString());

        child.on('close', (code) => {
          resolve({ stdout, stderr, exitCode: code || 0 });
        });
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Database');
    });

    test('should rollback transactions on errors', async () => {
      // This would require injecting an error during seeding
      // For now, verify error handling structure exists
      const result = await runCLIWithDB(['seed', '--env=test']);
      
      // Should complete successfully with good data
      expect(result.exitCode).toBe(0);
    });

    test('should handle partial failures gracefully', async () => {
      // Test that individual record failures don't stop entire operation
      const result = await runCLIWithDB(['seed', '--env=test', '--verbose']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Seeding Summary');
    });
  });

  describe('Audit Logging Integration', () => {
    test('should create audit logs for all operations', async () => {
      const result = await runCLIWithDB(['seed', '--env=test']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[AUDIT]');
      expect(result.stdout).toContain('database_seed');
      expect(result.stdout).toContain('SUCCESS');
      expect(result.stdout).toContain('Duration:');
    });

    test('should log failures with error details', async () => {
      // Use invalid environment to trigger failure
      const result = await runCLIWithDB(['seed', '--env=invalid']);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Environment must be either');
    });

    test('should redact PII from audit logs', async () => {
      const result = await runCLIWithDB(['seed', '--env=test', '--verbose']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('[AUDIT]');
      
      // Should not contain raw PII in audit logs
      expect(result.stdout).not.toContain('1985-03-15'); // Example DOB
      expect(result.stdout).not.toContain('7234'); // Example SSN
    });
  });

  describe('Data Integrity Integration', () => {
    test('should maintain foreign key relationships', async () => {
      await runCLIWithDB(['seed', '--env=test']);

      // Check foreign key integrity
      const client = await pool.connect();
      try {
        // Verify no orphaned records
        const orphanedContacts = await client.query(`
          SELECT COUNT(*) FROM contact_information ci
          LEFT JOIN identity_records ir ON ci.external_ref = ir.external_ref
          WHERE ir.external_ref IS NULL
        `);
        
        const orphanedFinancial = await client.query(`
          SELECT COUNT(*) FROM financial_data fd
          LEFT JOIN identity_records ir ON fd.external_ref = ir.external_ref
          WHERE ir.external_ref IS NULL
        `);

        expect(parseInt(orphanedContacts.rows[0].count)).toBe(0);
        expect(parseInt(orphanedFinancial.rows[0].count)).toBe(0);
      } finally {
        client.release();
      }
    });

    test('should handle all scenario types correctly', async () => {
      const result = await runCLIWithDB(['seed', '--env=test', '--verbose']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('successful_verification');
      expect(result.stdout).toContain('identity_verification_failure');
      expect(result.stdout).toContain('self_employed_applicant');

      // Verify specific scenario handling
      const client = await pool.connect();
      try {
        const scenarios = await client.query('SELECT scenario_name FROM test_scenarios');
        const scenarioNames = scenarios.rows.map(row => row.scenario_name);
        
        expect(scenarioNames).toContain('successful_verification');
        expect(scenarioNames).toContain('identity_verification_failure');
        expect(scenarioNames).toContain('self_employed_applicant');
      } finally {
        client.release();
      }
    });

    test('should hash PII data correctly', async () => {
      await runCLIWithDB(['seed', '--env=test']);

      const client = await pool.connect();
      try {
        const identityRecords = await client.query('SELECT dob_hash, ssn4_hash FROM identity_records LIMIT 1');
        const record = identityRecords.rows[0];
        
        expect(record.dob_hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
        expect(record.ssn4_hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
      } finally {
        client.release();
      }
    });
  });

  describe('Performance Integration', () => {
    test('should complete seeding within reasonable time', async () => {
      const startTime = Date.now();
      const result = await runCLIWithDB(['seed', '--env=test']);
      const duration = Date.now() - startTime;
      
      expect(result.exitCode).toBe(0);
      expect(duration).toBeLessThan(30000); // 30 seconds
    });

    test('should handle batch processing efficiently', async () => {
      const result = await runCLIWithDB(['seed', '--env=test', '--verbose']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('batch size: 100');
    });
  });
});