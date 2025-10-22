import { Pool } from 'pg';
import { DatabaseSeeder } from './src/database/seeding/seeder.js';
import { MockDataParser } from './src/database/seeding/parser.js';
import dotenv from 'dotenv';

dotenv.config();

async function debugSeeding() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 5000
  });

  const seeder = new DatabaseSeeder(pool);
  const parser = new MockDataParser();

  try {
    console.log('Parsing test scenarios...');
    const testScenarios = await parser.parseTestScenarios();
    console.log(`Found ${testScenarios.length} scenarios`);

    // Clean up first
    console.log('Cleaning up existing data...');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
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

    // Try seeding just one scenario
    console.log('Seeding one scenario...');
    const oneScenario = testScenarios.slice(0, 1);
    console.log('Scenario:', oneScenario[0].scenario_name);
    
    const results = await seeder.seedAllTables(oneScenario);
    
    console.log('Results:');
    results.forEach(result => {
      console.log(`${result.tableName}: processed=${result.recordsProcessed}, inserted=${result.recordsInserted}, errors=${result.errors.length}`);
      if (result.errors.length > 0) {
        console.log('Errors:', result.errors);
      }
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

debugSeeding();