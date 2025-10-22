/**
 * Comprehensive Test Scenarios Integration Tests
 * Requirements addressed: 3.1, 3.2, 3.3, 3.4
 * 
 * Tests for successful verification scenarios with correct data,
 * identity verification failure scenarios with incorrect data,
 * and special cases like job tenure discrepancies and address clarifications.
 */

import { Pool } from 'pg';
import { DatabaseSeeder } from '../../src/database/seeding/seeder';
import { MockDataParser } from '../../src/database/seeding/parser';
import { DatabaseValidator } from '../../src/database/seeding/validator';
import { TestScenario } from '../../src/database/interfaces';

describe('Comprehensive Test Scenarios Integration', () => {
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

  describe('Successful Verification Scenarios', () => {
    test('should handle successful_verification scenario with complete data flow', async () => {
      skipIfNoDB();
      
      const successScenario = testScenarios.find(s => s.scenario_name === 'successful_verification');
      expect(successScenario).toBeDefined();

      // Seed the scenario
      const results = await seeder.seedAllTables([successScenario!]);
      
      // Verify all tables were seeded successfully
      expect(results).toHaveLength(5);
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      expect(totalErrors).toBe(0);

      // Verify the complete data flow
      const client = await pool.connect();
      try {
        // Check identity record
        const identityResult = await client.query(
          'SELECT * FROM identity_records WHERE external_ref = $1',
          [successScenario!.scenario_name]
        );
        expect(identityResult.rows).toHaveLength(1);
        const identity = identityResult.rows[0];
        expect(identity.name).toBe('Michael Thompson');
        expect(identity.dob.toISOString().slice(0, 10)).toBe('1985-03-15');
        expect(identity.dob_hash).toMatch(/^[a-f0-9]{64}$/);
        expect(identity.ssn4_hash).toMatch(/^[a-f0-9]{64}$/);

        // Check contact information
        const contactResult = await client.query(
          'SELECT * FROM contact_information WHERE external_ref = $1',
          [successScenario!.scenario_name]
        );
        expect(contactResult.rows).toHaveLength(1);
        const contact = contactResult.rows[0];
        expect(contact.street_address).toBe('1247 Oak Street');
        expect(contact.unit_number).toBe('Unit 3B');
        expect(contact.city).toBe('Denver');
        expect(contact.state).toBe('Colorado');
        expect(contact.zip_code).toBe('80202');
        expect(contact.email).toBe('mthompson.denver@gmail.com');

        // Check financial data
        const financialResult = await client.query(
          'SELECT * FROM financial_data WHERE external_ref = $1',
          [successScenario!.scenario_name]
        );
        expect(financialResult.rows).toHaveLength(1);
        const financial = financialResult.rows[0];
        expect(parseFloat(financial.monthly_income)).toBe(6500);
        expect(financial.job_tenure_months).toBe(42);
        expect(financial.application_job_tenure).toBe(36);

        // Check application data
        const applicationResult = await client.query(
          'SELECT * FROM application_data WHERE external_ref = $1',
          [successScenario!.scenario_name]
        );
        expect(applicationResult.rows).toHaveLength(1);
        const application = applicationResult.rows[0];
        expect(application.application_id).toBe('APP_successful_verification');
        expect(application.status).toBe('pending');
        
        const metadata = application.metadata;
        expect(metadata.test).toBe(true);
        expect(metadata.scenario).toBe('successful_verification');
        expect(metadata.expected_outcome).toBe('success');

        // Check test scenario record
        const scenarioResult = await client.query(
          'SELECT * FROM test_scenarios WHERE scenario_name = $1',
          [successScenario!.scenario_name]
        );
        expect(scenarioResult.rows).toHaveLength(1);
        const scenario = scenarioResult.rows[0];
        expect(scenario.description).toBe('Standard successful flow with employed applicant');
        expect(scenario.expected_outcome).toBe('success');
        expect(scenario.scenario_type).toBe('standard');
        expect(scenario.applicant_name).toBe('Michael Thompson');

      } finally {
        client.release();
      }
    });

    test('should handle self_employed_applicant scenario with null job tenure', async () => {
      skipIfNoDB();
      
      const selfEmployedScenario = testScenarios.find(s => s.scenario_name === 'self_employed_applicant');
      expect(selfEmployedScenario).toBeDefined();

      const results = await seeder.seedAllTables([selfEmployedScenario!]);
      
      // Verify seeding completed without errors
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      expect(totalErrors).toBe(0);

      // Verify self-employed specific data
      const client = await pool.connect();
      try {
        const financialResult = await client.query(
          'SELECT * FROM financial_data WHERE external_ref = $1',
          [selfEmployedScenario!.scenario_name]
        );
        expect(financialResult.rows).toHaveLength(1);
        const financial = financialResult.rows[0];
        expect(parseFloat(financial.monthly_income)).toBe(7200);
        expect(financial.job_tenure_months).toBeNull();
        expect(financial.employment_status).toBe('self_employed');

        // Verify scenario type classification
        const scenarioResult = await client.query(
          'SELECT * FROM test_scenarios WHERE scenario_name = $1',
          [selfEmployedScenario!.scenario_name]
        );
        expect(scenarioResult.rows[0].scenario_type).toBe('self_employed');

      } finally {
        client.release();
      }
    });

    test('should handle no_email_provided scenario with null email', async () => {
      skipIfNoDB();
      
      const noEmailScenario = testScenarios.find(s => s.scenario_name === 'no_email_provided');
      expect(noEmailScenario).toBeDefined();

      const results = await seeder.seedAllTables([noEmailScenario!]);
      
      // Verify seeding completed without errors
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      expect(totalErrors).toBe(0);

      // Verify null email handling
      const client = await pool.connect();
      try {
        const contactResult = await client.query(
          'SELECT * FROM contact_information WHERE external_ref = $1',
          [noEmailScenario!.scenario_name]
        );
        expect(contactResult.rows).toHaveLength(1);
        const contact = contactResult.rows[0];
        expect(contact.email).toBeNull();
        expect(contact.street_address).toBe('789 Maple Street');
        expect(contact.unit_number).toBeNull();

      } finally {
        client.release();
      }
    });
  });

  describe('Identity Verification Failure Scenarios', () => {
    test('should handle identity_verification_failure scenario with correct data for database', async () => {
      skipIfNoDB();
      
      const failureScenario = testScenarios.find(s => s.scenario_name === 'identity_verification_failure');
      expect(failureScenario).toBeDefined();

      const results = await seeder.seedAllTables([failureScenario!]);
      
      // Verify seeding completed without errors
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      expect(totalErrors).toBe(0);

      // Verify that correct data is stored for database verification
      const client = await pool.connect();
      try {
        const identityResult = await client.query(
          'SELECT * FROM identity_records WHERE external_ref = $1',
          [failureScenario!.scenario_name]
        );
        expect(identityResult.rows).toHaveLength(1);
        const identity = identityResult.rows[0];
        
        // Should store correct_date_of_birth for database verification
        expect(identity.dob.toISOString().slice(0, 10)).toBe('1990-06-22');
        expect(identity.name).toBe('Jennifer Martinez');
        expect(identity.dob_hash).toMatch(/^[a-f0-9]{64}$/);
        expect(identity.ssn4_hash).toMatch(/^[a-f0-9]{64}$/);

        // Verify scenario classification
        const scenarioResult = await client.query(
          'SELECT * FROM test_scenarios WHERE scenario_name = $1',
          [failureScenario!.scenario_name]
        );
        expect(scenarioResult.rows[0].scenario_type).toBe('identity_failure');
        expect(scenarioResult.rows[0].expected_outcome).toBe('failure');
        expect(scenarioResult.rows[0].failure_reason).toBe('identity_verification_failed');

        // Should not have contact, financial, or application data for failure scenario
        const contactResult = await client.query(
          'SELECT * FROM contact_information WHERE external_ref = $1',
          [failureScenario!.scenario_name]
        );
        expect(contactResult.rows).toHaveLength(0);

      } finally {
        client.release();
      }
    });

    test('should handle partial_identity_failure_then_success scenario with attempt data', async () => {
      skipIfNoDB();
      
      const partialFailureScenario = testScenarios.find(s => s.scenario_name === 'partial_identity_failure_then_success');
      expect(partialFailureScenario).toBeDefined();

      const results = await seeder.seedAllTables([partialFailureScenario!]);
      
      // Verify seeding completed without errors
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      expect(totalErrors).toBe(0);

      // Verify that final correct data is stored
      const client = await pool.connect();
      try {
        const identityResult = await client.query(
          'SELECT * FROM identity_records WHERE external_ref = $1',
          [partialFailureScenario!.scenario_name]
        );
        expect(identityResult.rows).toHaveLength(1);
        const identity = identityResult.rows[0];
        
        // Should store the correct final attempt data
        expect(identity.dob.toISOString().slice(0, 10)).toBe('1975-07-25');
        expect(identity.name).toBe('Kevin Park');

        // Verify scenario classification
        const scenarioResult = await client.query(
          'SELECT * FROM test_scenarios WHERE scenario_name = $1',
          [partialFailureScenario!.scenario_name]
        );
        expect(scenarioResult.rows[0].scenario_type).toBe('partial_failure');
        expect(scenarioResult.rows[0].expected_outcome).toBe('success');

        // Should have complete data since it eventually succeeds
        const contactResult = await client.query(
          'SELECT * FROM contact_information WHERE external_ref = $1',
          [partialFailureScenario!.scenario_name]
        );
        expect(contactResult.rows).toHaveLength(1);

      } finally {
        client.release();
      }
    });
  });

  describe('Special Case Scenarios', () => {
    test('should handle job_tenure_discrepancy scenario with clarification data', async () => {
      skipIfNoDB();
      
      const discrepancyScenario = testScenarios.find(s => s.scenario_name === 'job_tenure_discrepancy');
      expect(discrepancyScenario).toBeDefined();

      const results = await seeder.seedAllTables([discrepancyScenario!]);
      
      // Verify seeding completed without errors
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      expect(totalErrors).toBe(0);

      // Verify tenure discrepancy data
      const client = await pool.connect();
      try {
        const financialResult = await client.query(
          'SELECT * FROM financial_data WHERE external_ref = $1',
          [discrepancyScenario!.scenario_name]
        );
        expect(financialResult.rows).toHaveLength(1);
        const financial = financialResult.rows[0];
        
        // Should show the discrepancy between stated and application tenure
        expect(financial.job_tenure_months).toBe(8);
        expect(financial.application_job_tenure).toBe(60);
        expect(parseFloat(financial.monthly_income)).toBe(8500);

        // Verify scenario classification
        const scenarioResult = await client.query(
          'SELECT * FROM test_scenarios WHERE scenario_name = $1',
          [discrepancyScenario!.scenario_name]
        );
        expect(scenarioResult.rows[0].scenario_type).toBe('tenure_discrepancy');
        expect(scenarioResult.rows[0].expected_outcome).toBe('success_with_clarification');

      } finally {
        client.release();
      }
    });

    test('should handle address_with_unit_clarification scenario with complete address', async () => {
      skipIfNoDB();
      
      const addressScenario = testScenarios.find(s => s.scenario_name === 'address_with_unit_clarification');
      expect(addressScenario).toBeDefined();

      const results = await seeder.seedAllTables([addressScenario!]);
      
      // Verify seeding completed without errors
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      expect(totalErrors).toBe(0);

      // Verify complete address data
      const client = await pool.connect();
      try {
        const contactResult = await client.query(
          'SELECT * FROM contact_information WHERE external_ref = $1',
          [addressScenario!.scenario_name]
        );
        expect(contactResult.rows).toHaveLength(1);
        const contact = contactResult.rows[0];
        
        // Should use complete_address data
        expect(contact.street_address).toBe('2580 Broadway Street');
        expect(contact.unit_number).toBe('Apartment 15F');
        expect(contact.city).toBe('New York');
        expect(contact.state).toBe('New York');
        expect(contact.zip_code).toBe('10025');

        // Verify scenario classification
        const scenarioResult = await client.query(
          'SELECT * FROM test_scenarios WHERE scenario_name = $1',
          [addressScenario!.scenario_name]
        );
        expect(scenarioResult.rows[0].scenario_type).toBe('address_clarification');

      } finally {
        client.release();
      }
    });

    test('should handle recent_job_change scenario with job change reason', async () => {
      skipIfNoDB();
      
      const jobChangeScenario = testScenarios.find(s => s.scenario_name === 'recent_job_change');
      expect(jobChangeScenario).toBeDefined();

      const results = await seeder.seedAllTables([jobChangeScenario!]);
      
      // Verify seeding completed without errors
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      expect(totalErrors).toBe(0);

      // Verify job change data
      const client = await pool.connect();
      try {
        const financialResult = await client.query(
          'SELECT * FROM financial_data WHERE external_ref = $1',
          [jobChangeScenario!.scenario_name]
        );
        expect(financialResult.rows).toHaveLength(1);
        const financial = financialResult.rows[0];
        
        // Should show recent job change with reason
        expect(financial.job_tenure_months).toBe(6);
        expect(financial.application_job_tenure).toBe(6);
        expect(financial.job_change_reason).toBe('Career advancement opportunity');
        expect(parseFloat(financial.monthly_income)).toBe(4900);

        // Verify scenario classification
        const scenarioResult = await client.query(
          'SELECT * FROM test_scenarios WHERE scenario_name = $1',
          [jobChangeScenario!.scenario_name]
        );
        expect(scenarioResult.rows[0].scenario_type).toBe('tenure_discrepancy');
        expect(scenarioResult.rows[0].expected_outcome).toBe('success_with_clarification');

      } finally {
        client.release();
      }
    });
  });

  describe('Data Integrity and Relationships', () => {
    test('should maintain foreign key relationships across all scenarios', async () => {
      skipIfNoDB();
      
      // Seed all scenarios
      const results = await seeder.seedAllTables(testScenarios);
      
      // Verify no errors
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      expect(totalErrors).toBe(0);

      // Verify foreign key integrity
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

    test('should handle all scenario types with correct classification', async () => {
      skipIfNoDB();
      
      // Seed all scenarios
      await seeder.seedAllTables(testScenarios);

      // Verify scenario type classifications
      const client = await pool.connect();
      try {
        const scenarios = await client.query('SELECT scenario_name, scenario_type FROM test_scenarios ORDER BY scenario_name');
        const scenarioMap = new Map(scenarios.rows.map(row => [row.scenario_name, row.scenario_type]));

        expect(scenarioMap.get('successful_verification')).toBe('standard');
        expect(scenarioMap.get('self_employed_applicant')).toBe('self_employed');
        expect(scenarioMap.get('identity_verification_failure')).toBe('identity_failure');
        expect(scenarioMap.get('job_tenure_discrepancy')).toBe('tenure_discrepancy');
        expect(scenarioMap.get('no_email_provided')).toBe('standard');
        expect(scenarioMap.get('address_with_unit_clarification')).toBe('address_clarification');
        expect(scenarioMap.get('recent_job_change')).toBe('tenure_discrepancy');
        expect(scenarioMap.get('partial_identity_failure_then_success')).toBe('partial_failure');

      } finally {
        client.release();
      }
    });

    test('should validate PII hashing consistency across scenarios', async () => {
      skipIfNoDB();
      
      // Seed all scenarios
      await seeder.seedAllTables(testScenarios);

      // Verify hash consistency
      const client = await pool.connect();
      try {
        const identityRecords = await client.query('SELECT external_ref, dob, dob_hash, ssn4_hash FROM identity_records');
        
        for (const record of identityRecords.rows) {
          // Verify hash format
          expect(record.dob_hash).toMatch(/^[a-f0-9]{64}$/);
          expect(record.ssn4_hash).toMatch(/^[a-f0-9]{64}$/);
          
          // Verify DOB format
          expect(record.dob.toISOString().slice(0, 10)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }

        // Verify unique hashes for different data
        const uniqueHashes = new Set(identityRecords.rows.map(r => r.dob_hash));
        expect(uniqueHashes.size).toBeGreaterThan(1); // Should have different hashes for different DOBs

      } finally {
        client.release();
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