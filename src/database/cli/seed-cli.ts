#!/usr/bin/env node

import { config } from 'dotenv';
import { DatabaseManager } from '../connection/database-manager';
import { MockDataParser } from '../seeding/parser';
import { DatabaseSeeder } from '../seeding/seeder';
import { DatabaseValidator } from '../seeding/validator';

// Load environment variables from .env file
config();

/**
 * CLI script for seeding database with test data from mock_test_data.json
 * Usage: 
 *   tsx src/database/cli/seed-cli.ts [--env=test|production] [--dry-run] [--clean] [--reset]
 * 
 * Commands:
 *   seed (default) - Seed database with test data
 *   clean - Remove all test data from database
 *   reset - Clean and then seed database
 * 
 * Requirements addressed: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const envArg = args.find(arg => arg.startsWith('--env='));
  const environment = envArg ? envArg.split('=')[1] as 'test' | 'production' : 'test';
  
  const command = args.find(arg => !arg.startsWith('--')) || 'seed';
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  if (environment !== 'test' && environment !== 'production') {
    console.error('Error: Environment must be either "test" or "production"');
    process.exit(1);
  }

  console.log(`=== Database Seeding CLI ===`);
  console.log(`Command: ${command}`);
  console.log(`Environment: ${environment}`);
  console.log(`Dry run: ${dryRun ? 'Yes' : 'No'}`);
  console.log(`Verbose: ${verbose ? 'Yes' : 'No'}`);

  const dbManager = new DatabaseManager();

  try {
    // Get database pool
    const pool = dbManager.getPool(environment);
    
    // Validate database connection and environment
    console.log('\n=== Database Validation ===');
    const validator = new DatabaseValidator(dbManager.getDatabaseUrl(environment));
    
    const connectionValid = await validator.validateConnection(dbManager.getDatabaseUrl(environment));
    if (!connectionValid) {
      throw new Error('Database connection validation failed');
    }
    console.log('✓ Database connection validated');

    const envValid = await validator.validateEnvironment(environment);
    if (!envValid) {
      throw new Error(`Environment validation failed for ${environment}`);
    }
    console.log(`✓ Environment validated for ${environment}`);

    const missingTables = await validator.checkRequiredTables();
    if (missingTables.length > 0) {
      throw new Error(`Missing required tables: ${missingTables.join(', ')}`);
    }
    console.log('✓ All required tables exist');

    // Execute command
    switch (command) {
      case 'seed':
        await seedDatabase(pool, dryRun, verbose);
        break;
      case 'clean':
        await cleanDatabase(pool, dryRun, verbose);
        break;
      case 'reset':
        await cleanDatabase(pool, dryRun, verbose);
        if (!dryRun) {
          await seedDatabase(pool, dryRun, verbose);
        }
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.error('Available commands: seed, clean, reset');
        process.exit(1);
    }

    await validator.close();
    console.log('\n✓ Database seeding operation completed successfully');

  } catch (error) {
    console.error('\n✗ Database seeding operation failed:', error);
    process.exit(1);
  } finally {
    await dbManager.shutdown();
  }
}

/**
 * Seed database with test data
 */
async function seedDatabase(pool: any, dryRun: boolean, verbose: boolean) {
  console.log('\n=== Seeding Database ===');

  try {
    // Parse test scenarios
    const parser = new MockDataParser();
    const scenarios = await parser.parseTestScenarios();
    
    if (verbose) {
      console.log('Parsed scenarios:');
      scenarios.forEach(scenario => {
        console.log(`  - ${scenario.scenario_name}: ${scenario.description}`);
      });
    }

    // Create seeder and seed all tables
    const seeder = new DatabaseSeeder(pool);
    const results = await seeder.seedAllTables(scenarios, {
      dryRun,
      batchSize: 100,
      skipValidation: false
    });

    // Display detailed results if verbose
    if (verbose) {
      console.log('\nDetailed Results:');
      results.forEach(result => {
        console.log(`\n${result.tableName}:`);
        console.log(`  Processed: ${result.recordsProcessed}`);
        console.log(`  Inserted: ${result.recordsInserted}`);
        console.log(`  Updated: ${result.recordsUpdated}`);
        if (result.errors.length > 0) {
          console.log(`  Errors: ${result.errors.length}`);
          result.errors.forEach(error => console.log(`    - ${error}`));
        }
      });
    }

  } catch (error) {
    throw new Error(`Seeding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Clean test data from database
 */
async function cleanDatabase(pool: any, dryRun: boolean, verbose: boolean) {
  console.log('\n=== Cleaning Database ===');

  if (dryRun) {
    console.log('🔍 DRY RUN - Would clean test data from all tables');
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Clean in reverse dependency order
    const tables = [
      'test_scenarios',
      'application_data',
      'financial_data', 
      'contact_information',
      'identity_records'
    ];

    let totalDeleted = 0;

    for (const tableName of tables) {
      const result = await client.query(`
        DELETE FROM ${tableName} 
        WHERE external_ref LIKE '%test%' 
           OR external_ref LIKE '%scenario%'
           OR (created_at > NOW() - INTERVAL '1 day' AND external_ref ~ '^[a-z_]+$')
      `);

      const deletedCount = result.rowCount || 0;
      totalDeleted += deletedCount;

      if (verbose || deletedCount > 0) {
        console.log(`✓ Cleaned ${deletedCount} records from ${tableName}`);
      }
    }

    await client.query('COMMIT');
    console.log(`✓ Cleaned ${totalDeleted} total records from database`);

  } catch (error) {
    await client.query('ROLLBACK');
    throw new Error(`Cleaning failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    client.release();
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