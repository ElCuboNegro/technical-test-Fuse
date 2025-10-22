#!/usr/bin/env node

import { config } from 'dotenv';
import { DatabaseManager } from '../connection/database-manager';
import { MockDataParser } from '../seeding/parser';
import { DatabaseSeeder } from '../seeding/seeder';
import { DatabaseValidator } from '../seeding/validator';

// Progress reporting utility
class ProgressReporter {
  private startTime: number = Date.now();
  
  showProgress(current: number, total: number, operation: string) {
    const percentage = Math.round((current / total) * 100);
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    const bar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
    
    process.stdout.write(`\r${operation}: [${bar}] ${percentage}% (${current}/${total}) - ${elapsed}s`);
    
    if (current === total) {
      console.log(); // New line when complete
    }
  }
  
  reset() {
    this.startTime = Date.now();
  }
}

// Audit logging utility
class AuditLogger {
  private logs: Array<{
    timestamp: string;
    operation: string;
    environment: string;
    command: string;
    user: string;
    success: boolean;
    details: any;
    duration?: number;
  }> = [];
  
  private startTime: number = Date.now();
  
  logOperation(operation: string, environment: string, command: string, success: boolean, details: any = {}) {
    const duration = Date.now() - this.startTime;
    
    // Redact any PII from details
    const sanitizedDetails = this.redactPII(details);
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      operation,
      environment,
      command,
      user: process.env.USER || process.env.USERNAME || 'unknown',
      success,
      details: sanitizedDetails,
      duration
    };
    
    this.logs.push(logEntry);
    
    // Write to console in structured format
    console.log(`\n[AUDIT] ${logEntry.timestamp} - ${operation} - ${success ? 'SUCCESS' : 'FAILURE'}`);
    console.log(`  Environment: ${environment}`);
    console.log(`  Command: ${command}`);
    console.log(`  Duration: ${duration}ms`);
    
    if (!success && details.error) {
      console.log(`  Error: ${details.error}`);
    }
  }
  
  private redactPII(details: any): any {
    if (!details || typeof details !== 'object') {
      return details;
    }
    
    const redacted = { ...details };
    
    // Redact common PII fields
    const piiFields = ['ssn', 'ssn_last_four', 'date_of_birth', 'dob', 'email', 'name'];
    
    for (const field of piiFields) {
      if (redacted[field]) {
        redacted[field] = '[REDACTED]';
      }
    }
    
    // Redact nested objects
    for (const key in redacted) {
      if (typeof redacted[key] === 'object') {
        redacted[key] = this.redactPII(redacted[key]);
      }
    }
    
    return redacted;
  }
  
  reset() {
    this.startTime = Date.now();
  }
  
  getLogs() {
    return this.logs;
  }
}

// Load environment variables from .env file
config();

/**
 * CLI script for seeding database with test data from mock_test_data.json
 * 
 * Usage: 
 *   tsx src/database/cli/seed-cli.ts [command] [options]
 * 
 * Commands:
 *   seed (default) - Seed database with test data
 *   clean - Remove all test data from database
 *   reset - Clean and then seed database
 *   validate - Validate database schema and data integrity
 *   setup - Run migrations and seed database (full setup)
 * 
 * Options:
 *   --env=test|production - Target environment (default: test)
 *   --dry-run - Show what would be done without making changes
 *   --verbose - Show detailed output and progress
 * 
 * Examples:
 *   tsx src/database/cli/seed-cli.ts seed --env=test --verbose
 *   tsx src/database/cli/seed-cli.ts clean --dry-run
 *   tsx src/database/cli/seed-cli.ts reset --env=production
 *   tsx src/database/cli/seed-cli.ts validate
 *   tsx src/database/cli/seed-cli.ts setup --env=test
 * 
 * Requirements addressed: 4.2, 4.4, 4.5, 8.4, 8.5, 8.6
 */

function showHelp() {
  console.log(`
Database Seeding CLI

Usage: tsx src/database/cli/seed-cli.ts [command] [options]

Commands:
  seed (default)  Seed database with test data from mock_test_data.json
  clean          Remove all test data from database
  reset          Clean and then seed database (clean + seed)
  validate       Validate database schema and data integrity
  setup          Run migrations and seed database (full setup)
  help           Show this help message

Options:
  --env=ENV      Target environment: test or production (default: test)
  --dry-run      Show what would be done without making changes
  --verbose      Show detailed output and progress information
  --help, -h     Show this help message

Examples:
  tsx src/database/cli/seed-cli.ts seed --env=test --verbose
  tsx src/database/cli/seed-cli.ts clean --dry-run
  tsx src/database/cli/seed-cli.ts reset --env=production
  tsx src/database/cli/seed-cli.ts validate
  tsx src/database/cli/seed-cli.ts setup --env=test

Safety Features:
  - Production operations require explicit confirmation
  - Dry-run mode available for all operations
  - Environment validation prevents accidental production seeding
  - Comprehensive error handling and rollback on failures

For more information, see DATABASE_SEEDING.md
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const envArg = args.find(arg => arg.startsWith('--env='));
  const environment = envArg ? envArg.split('=')[1] as 'test' | 'production' : 'test';
  
  const command = args.find(arg => !arg.startsWith('--')) || 'seed';
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const help = args.includes('--help') || args.includes('-h') || command === 'help';

  if (help) {
    showHelp();
    process.exit(0);
  }

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
  const auditLogger = new AuditLogger();
  const progressReporter = new ProgressReporter();

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

    // Production safety check
    if (environment === 'production') {
      const dbName = dbManager.getDatabaseName(environment);
      if (dbName.includes('prod') || dbName.includes('production')) {
        console.log('\n⚠️  WARNING: You are about to modify a PRODUCTION database!');
        console.log(`Database: ${dbName}`);
        console.log(`Command: ${command}`);
        
        if (!dryRun) {
          const readline = require('readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          const answer = await new Promise<string>((resolve) => {
            rl.question('Type "CONFIRM" to proceed with production operation: ', resolve);
          });
          rl.close();
          
          if (answer !== 'CONFIRM') {
            console.log('Operation cancelled.');
            process.exit(0);
          }
        }
      }
    }

    // Execute command with audit logging
    auditLogger.reset();
    let operationSuccess = false;
    
    try {
      switch (command) {
        case 'seed':
          await seedDatabase(pool, dryRun, verbose, progressReporter);
          operationSuccess = true;
          break;
        case 'clean':
          await cleanDatabase(pool, dryRun, verbose, progressReporter);
          operationSuccess = true;
          break;
        case 'reset':
          await cleanDatabase(pool, dryRun, verbose, progressReporter);
          if (!dryRun) {
            await seedDatabase(pool, dryRun, verbose, progressReporter);
          }
          operationSuccess = true;
          break;
        case 'validate':
          await validateDatabase(pool, verbose);
          operationSuccess = true;
          break;
        case 'setup':
          await setupDatabase(pool, dryRun, verbose, progressReporter);
          operationSuccess = true;
          break;
        default:
          console.error(`Unknown command: ${command}`);
          console.error('Available commands: seed, clean, reset, validate, setup');
          process.exit(1);
      }
      
      auditLogger.logOperation(
        `database_${command}`,
        environment,
        `${command} ${dryRun ? '--dry-run' : ''} ${verbose ? '--verbose' : ''}`.trim(),
        operationSuccess,
        { dryRun, verbose }
      );
      
    } catch (error) {
      auditLogger.logOperation(
        `database_${command}`,
        environment,
        `${command} ${dryRun ? '--dry-run' : ''} ${verbose ? '--verbose' : ''}`.trim(),
        false,
        { dryRun, verbose, error: error instanceof Error ? error.message : 'Unknown error' }
      );
      throw error;
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
async function seedDatabase(pool: any, dryRun: boolean, verbose: boolean, progressReporter?: ProgressReporter) {
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

    // Create seeder and seed all tables with progress reporting
    const seeder = new DatabaseSeeder(pool);
    
    if (verbose) {
      console.log(`\nProcessing ${scenarios.length} scenarios in batches of 100...`);
      console.log('Progress will be shown for each table...\n');
    }
    
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
 * Validate database schema and data integrity
 */
async function validateDatabase(pool: any, verbose: boolean) {
  console.log('\n=== Validating Database ===');

  const client = await pool.connect();
  let validationErrors = 0;

  try {
    // Check table existence
    const tables = ['identity_records', 'contact_information', 'financial_data', 'application_data', 'test_scenarios'];
    
    for (const tableName of tables) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )
      `, [tableName]);
      
      if (!result.rows[0].exists) {
        console.log(`✗ Table ${tableName} does not exist`);
        validationErrors++;
      } else if (verbose) {
        console.log(`✓ Table ${tableName} exists`);
      }
    }

    // Check foreign key relationships
    const orphanedRecords = await client.query(`
      SELECT 'contact_information' as table_name, COUNT(*) as count
      FROM contact_information ci
      LEFT JOIN identity_records ir ON ci.external_ref = ir.external_ref
      WHERE ir.external_ref IS NULL
      UNION ALL
      SELECT 'financial_data' as table_name, COUNT(*) as count
      FROM financial_data fd
      LEFT JOIN identity_records ir ON fd.external_ref = ir.external_ref
      WHERE ir.external_ref IS NULL
      UNION ALL
      SELECT 'application_data' as table_name, COUNT(*) as count
      FROM application_data ad
      LEFT JOIN identity_records ir ON ad.external_ref = ir.external_ref
      WHERE ir.external_ref IS NULL
    `);

    orphanedRecords.rows.forEach(row => {
      if (parseInt(row.count) > 0) {
        console.log(`✗ Found ${row.count} orphaned records in ${row.table_name}`);
        validationErrors++;
      } else if (verbose) {
        console.log(`✓ No orphaned records in ${row.table_name}`);
      }
    });

    // Check data integrity
    const integrityChecks = await client.query(`
      SELECT 
        'identity_records' as table_name,
        COUNT(*) as total_records,
        COUNT(CASE WHEN dob_hash IS NULL OR ssn4_hash IS NULL THEN 1 END) as missing_hashes
      FROM identity_records
      UNION ALL
      SELECT 
        'contact_information' as table_name,
        COUNT(*) as total_records,
        COUNT(CASE WHEN street_address IS NULL OR city IS NULL OR state IS NULL OR zip_code IS NULL THEN 1 END) as missing_required
      FROM contact_information
    `);

    integrityChecks.rows.forEach(row => {
      if (verbose) {
        console.log(`✓ ${row.table_name}: ${row.total_records} records`);
      }
      
      const missingData = parseInt(row.missing_hashes || row.missing_required || '0');
      if (missingData > 0) {
        console.log(`✗ ${row.table_name}: ${missingData} records with missing required data`);
        validationErrors++;
      }
    });

    if (validationErrors === 0) {
      console.log('✓ Database validation passed');
    } else {
      console.log(`✗ Database validation failed with ${validationErrors} errors`);
      process.exit(1);
    }

  } catch (error) {
    console.error('✗ Database validation error:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

/**
 * Setup database with migrations and seeding
 */
async function setupDatabase(pool: any, dryRun: boolean, verbose: boolean, progressReporter?: ProgressReporter) {
  console.log('\n=== Setting Up Database ===');

  if (dryRun) {
    console.log('🔍 DRY RUN - Would run migrations and seed database');
    return;
  }

  try {
    // Note: In a real implementation, this would run migrations first
    console.log('1. Running database migrations...');
    console.log('   (Migration system would be called here)');
    
    // Seed the database
    console.log('2. Seeding database with test data...');
    await seedDatabase(pool, dryRun, verbose, progressReporter);
    
    // Validate the setup
    console.log('3. Validating database setup...');
    await validateDatabase(pool, verbose);
    
    console.log('✓ Database setup completed successfully');

  } catch (error) {
    console.error('✗ Database setup failed:', error);
    process.exit(1);
  }
}

/**
 * Clean test data from database
 */
async function cleanDatabase(pool: any, dryRun: boolean, verbose: boolean, progressReporter?: ProgressReporter) {
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

    for (let i = 0; i < tables.length; i++) {
      const tableName = tables[i];
      
      if (progressReporter && verbose) {
        progressReporter.showProgress(i + 1, tables.length, 'Cleaning tables');
      }
      
      const result = await client.query(`
        DELETE FROM ${tableName} 
        WHERE external_ref LIKE '%test%' 
           OR external_ref LIKE '%scenario%'
           OR (created_at > NOW() - INTERVAL '1 day' AND external_ref ~ '^[a-z_]+$')$')$')
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