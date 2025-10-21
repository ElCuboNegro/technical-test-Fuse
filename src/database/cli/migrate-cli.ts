#!/usr/bin/env node

import { config } from 'dotenv';
import { MigrationRunner } from '../migration/runner';

// Load environment variables from .env file
config();

/**
 * CLI script for running database migrations
 * Usage: tsx src/database/cli/migrate-cli.ts [--env=test|production]
 * 
 * Requirements addressed: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */

async function main() {
  const args = process.argv.slice(2);
  const envArg = args.find(arg => arg.startsWith('--env='));
  const environment = envArg ? envArg.split('=')[1] as 'test' | 'production' : 'test';

  if (environment !== 'test' && environment !== 'production') {
    console.error('Error: Environment must be either "test" or "production"');
    process.exit(1);
  }

  console.log(`Running missing tables migration for ${environment} environment...`);

  const migrationRunner = new MigrationRunner();

  try {
    // Execute the missing tables migration
    const result = await migrationRunner.executeMissingTablesMigration(environment);

    if (result.success) {
      console.log(`✓ Migration completed successfully in ${result.executionTimeMs}ms`);
      
      // Validate that all tables were created
      const tablesExist = await migrationRunner.validateTablesExist(environment);
      if (tablesExist) {
        console.log('✓ All required tables validated successfully');
      } else {
        console.error('✗ Some required tables are missing after migration');
        process.exit(1);
      }
    } else {
      console.error(`✗ Migration failed: ${result.error}`);
      process.exit(1);
    }

  } catch (error) {
    console.error('✗ Migration execution failed:', error);
    process.exit(1);
  } finally {
    await migrationRunner.cleanup();
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