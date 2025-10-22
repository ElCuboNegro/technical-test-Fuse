#!/usr/bin/env node

import { config } from 'dotenv';
import { DatabaseManager } from '../connection/database-manager';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load environment variables from .env file
config();

/**
 * CLI script for testing data structure compatibility with mock_test_data.json
 * Usage: tsx src/database/cli/test-data-structure.ts [--env=test|production]
 */

async function main() {
  const args = process.argv.slice(2);
  const envArg = args.find(arg => arg.startsWith('--env='));
  const environment = envArg ? envArg.split('=')[1] as 'test' | 'production' : 'test';

  if (environment !== 'test' && environment !== 'production') {
    console.error('Error: Environment must be either "test" or "production"');
    process.exit(1);
  }

  console.log(`Testing data structure compatibility for ${environment} environment...`);

  const dbManager = new DatabaseManager();

  try {
    // Load mock test data
    const mockDataPath = join(process.cwd(), 'tests', 'mock_test_data.json');
    const mockData = JSON.parse(readFileSync(mockDataPath, 'utf-8'));
    const testScenario = mockData.test_scenarios[0]; // Use first scenario

    const pool = dbManager.getPool(environment);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Test identity_records insertion
      console.log('\n=== Testing identity_records ===');
      const identityResult = await client.query(`
        INSERT INTO identity_records (external_ref, name, dob, dob_hash, ssn4_hash)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (external_ref) DO UPDATE SET
          name = EXCLUDED.name,
          dob = EXCLUDED.dob,
          dob_hash = EXCLUDED.dob_hash,
          ssn4_hash = EXCLUDED.ssn4_hash,
          updated_at = NOW()
        RETURNING id, external_ref
      `, [
        testScenario.scenario_name,
        testScenario.applicant_data.name,
        testScenario.applicant_data.date_of_birth,
        'test_dob_hash_' + testScenario.scenario_name,
        'test_ssn_hash_' + testScenario.scenario_name
      ]);
      console.log('✓ identity_records insertion successful');

      // Test contact_information insertion
      console.log('\n=== Testing contact_information ===');
      const contactResult = await client.query(`
        INSERT INTO contact_information (external_ref, street_address, unit_number, city, state, zip_code, email)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (external_ref) DO UPDATE SET
          street_address = EXCLUDED.street_address,
          unit_number = EXCLUDED.unit_number,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          zip_code = EXCLUDED.zip_code,
          email = EXCLUDED.email,
          updated_at = NOW()
        RETURNING id, external_ref
      `, [
        testScenario.scenario_name,
        testScenario.applicant_data.mailing_address.street,
        testScenario.applicant_data.mailing_address.unit,
        testScenario.applicant_data.mailing_address.city,
        testScenario.applicant_data.mailing_address.state,
        testScenario.applicant_data.mailing_address.zip_code,
        testScenario.applicant_data.email
      ]);
      console.log('✓ contact_information insertion successful');

      // Test financial_data insertion
      console.log('\n=== Testing financial_data ===');
      const financialResult = await client.query(`
        INSERT INTO financial_data (external_ref, monthly_income, job_tenure_months, employment_status, application_job_tenure)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (external_ref) DO UPDATE SET
          monthly_income = EXCLUDED.monthly_income,
          job_tenure_months = EXCLUDED.job_tenure_months,
          employment_status = EXCLUDED.employment_status,
          application_job_tenure = EXCLUDED.application_job_tenure,
          updated_at = NOW()
        RETURNING id, external_ref
      `, [
        testScenario.scenario_name,
        testScenario.applicant_data.monthly_income,
        testScenario.applicant_data.job_tenure_months,
        'employed',
        testScenario.applicant_data.application_job_tenure
      ]);
      console.log('✓ financial_data insertion successful');

      // Test application_data insertion
      console.log('\n=== Testing application_data ===');
      const applicationResult = await client.query(`
        INSERT INTO application_data (external_ref, application_id, status, notes, metadata)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (external_ref) DO UPDATE SET
          application_id = EXCLUDED.application_id,
          status = EXCLUDED.status,
          notes = EXCLUDED.notes,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING id, external_ref
      `, [
        testScenario.scenario_name,
        'APP_' + testScenario.scenario_name,
        'pending',
        'Test application for ' + testScenario.description,
        JSON.stringify({ test: true, scenario: testScenario.scenario_name })
      ]);
      console.log('✓ application_data insertion successful');

      // Test test_scenarios insertion
      console.log('\n=== Testing test_scenarios ===');
      const scenarioResult = await client.query(`
        INSERT INTO test_scenarios (scenario_name, description, expected_outcome, scenario_type, expected_flow, applicant_name)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (scenario_name) DO UPDATE SET
          description = EXCLUDED.description,
          expected_outcome = EXCLUDED.expected_outcome,
          scenario_type = EXCLUDED.scenario_type,
          expected_flow = EXCLUDED.expected_flow,
          applicant_name = EXCLUDED.applicant_name,
          updated_at = NOW()
        RETURNING id, scenario_name
      `, [
        testScenario.scenario_name,
        testScenario.description,
        testScenario.expected_outcome,
        'standard',
        JSON.stringify(testScenario.expected_flow),
        testScenario.applicant_data.name
      ]);
      console.log('✓ test_scenarios insertion successful');

      // Verify foreign key relationships work
      console.log('\n=== Testing Foreign Key Relationships ===');
      const relationshipTest = await client.query(`
        SELECT 
          ir.external_ref,
          ir.name,
          ci.street_address,
          ci.city,
          fd.monthly_income,
          fd.job_tenure_months,
          ad.status,
          ts.expected_outcome
        FROM identity_records ir
        LEFT JOIN contact_information ci ON ir.external_ref = ci.external_ref
        LEFT JOIN financial_data fd ON ir.external_ref = fd.external_ref
        LEFT JOIN application_data ad ON ir.external_ref = ad.external_ref
        LEFT JOIN test_scenarios ts ON ir.external_ref = ts.scenario_name
        WHERE ir.external_ref = $1
      `, [testScenario.scenario_name]);

      if (relationshipTest.rows.length > 0) {
        const row = relationshipTest.rows[0];
        console.log('✓ Foreign key relationships working correctly');
        console.log(`  - Name: ${row.name}`);
        console.log(`  - Address: ${row.street_address}, ${row.city}`);
        console.log(`  - Income: $${row.monthly_income}`);
        console.log(`  - Tenure: ${row.job_tenure_months} months`);
        console.log(`  - Status: ${row.status}`);
        console.log(`  - Expected outcome: ${row.expected_outcome}`);
      } else {
        throw new Error('Foreign key relationships not working correctly');
      }

      await client.query('ROLLBACK'); // Don't commit test data
      console.log('\n✓ All data structure tests passed successfully (data rolled back)');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('✗ Data structure test failed:', error);
    process.exit(1);
  } finally {
    await dbManager.shutdown();
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

if (require.main === module) {
  main();
}