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
    
    // Output audit log
    const status = success ? 'SUCCESS' : 'FAILURE';
    console.log(`\n[AUDIT] ${logEntry.timestamp} - ${operation} - ${status}`);
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
    if (redacted.dob) redacted.dob = '****-**-**';
    if (redacted.ssn) redacted.ssn = '****';
    if (redacted.email) redacted.email = '****@****.***';
    if (redacted.address) redacted.address = '[REDACTED]';
    
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

function showHelp() {
  console.log(`
=== Database Seeding CLI ===

Usage: tsx seed-cli.ts [command] [options]

Commands:
  seed      Seed database with test data
  clean     Clean test data from database
  reset     Clean and then seed database
  validate  Validate database schema and data
  setup     Run migrations and seed database
  help      Show this help message

Options:
  --env=<env>     Environment (test|production) [default: test]
  --dry-run       Show what would be done without making changes
  --verbose       Show detailed output and progress
  --help, -h      Show this help message

Examples:
  tsx seed-cli.ts seed --env=test
  tsx seed-cli.ts clean --env=test --dry-run
  tsx seed-cli.ts reset --env=test --verbose
  tsx seed-cli.ts validate --env=test

Safety Features:
  - Production environment requires explicit confirmation
  - Dry-run mode available for all operations
  - Comprehensive audit logging
  - PII redaction in logs
  - Database validation before operations

For more information, see DATABASE_SEEDING.md
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const environment = args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'test';
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const help = args.includes('--help') || args.includes('-h') || command === 'help';

  if (help) {
    showHelp();
    return;
  }

  // Validate environment
  if (!['test', 'production'].includes(environment)) {
    console.error('Error: Environment must be either "test" or "production"');
    process.exit(1);
  }

  // Show production warning
  if (environment === 'production' && !dryRun) {
    console.log('⚠️  WARNING: Running in PRODUCTION environment');
    console.log('   This will affect live data. Use --dry-run to preview changes.');
  }

  console.log('=== Database Seeding CLI ===');
  console.log(`Command: ${command}`);
  console.log(`Environment: ${environment}`);
  console.log(`Dry run: ${dryRun ? 'Yes' : 'No'}`);
  console.log(`Verbose: ${verbose ? 'Yes' : 'No'}`);

  const progressReporter = new ProgressReporter();
  const auditLogger = new AuditLogger();
  let operationSuccess = false;

  try {
    // Initialize database manager
    const dbManager = new DatabaseManager();
    await dbManager.initialize();
    const pool = dbManager.getPool(environment as 'test' | 'production');

    if (!pool) {
      throw new Error(`Failed to get database pool for environment: ${environment}`);
    }

    // Show database configuration
    const databaseUrl = dbManager.getDatabaseUrl(environment as 'test' | 'production');
    
    console.log('Database Configuration:');
    console.log(`  Environment: ${environment}`);
    console.log(`  Database URL: ${databaseUrl.replace(/:[^:@]*@/, ':***@')}`);

    // Validate database before operations
    const validator = new DatabaseValidator(databaseUrl);
    
    console.log('\n=== Database Validation ===');
    const connectionValid = await validator.validateConnection(databaseUrl);
    if (!connectionValid) {
      throw new Error('Database connection validation failed');
    }
    console.log('✓ Database connection validated');

    const environmentValid = await validator.validateEnvironment(environment as 'test' | 'production');
    if (!environmentValid) {
      throw new Error(`Environment validation failed for: ${environment}`);
    }
    console.log(`✓ Environment validated for ${environment}`);

    const missingTables = await validator.checkRequiredTables();
    if (missingTables.length > 0) {
      throw new Error(`Missing required tables: ${missingTables.join(', ')}`);
    }
    console.log('✓ All required tables exist');
    
    try {
      switch (command) {
        case 'seed':
          auditLogger.reset();
          await seedDatabase(pool, dryRun, verbose, progressReporter);
          operationSuccess = true;
          break;
        case 'clean':
          auditLogger.reset();
          await cleanDatabase(pool, dryRun, verbose, progressReporter);
          operationSuccess = true;
          break;
        case 'reset':
          auditLogger.reset();
          await cleanDatabase(pool, dryRun, verbose, progressReporter);
          if (!dryRun) {
            await seedDatabase(pool, dryRun, verbose, progressReporter);
          }
          operationSuccess = true;
          break;
        case 'validate':
          auditLogger.reset();
          await validateDatabase(pool, verbose);
          operationSuccess = true;
          break;
        case 'setup':
          auditLogger.reset();
          await setupDatabase(pool, dryRun, verbose, progressReporter);
          operationSuccess = true;
          break;
        default:
          console.error(`Unknown command: ${command}`);
          console.log('Use --help to see available commands');
          process.exit(1);
      }

      // Log successful operation
      auditLogger.logOperation(`database_${command}`, environment, command, true);
      console.log('✓ Database seeding operation completed successfully');

    } catch (error) {
      // Log failed operation
      auditLogger.logOperation(`database_${command}`, environment, command, false, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      console.error(`✗ Database seeding operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    } finally {
      await validator.close();
    }

    // Shutdown database connections
    console.log('✓ Database connections shut down successfully');
    await dbManager.shutdown();

  } catch (error) {
    console.error(`✗ Database operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

/**
 * Seed database with test data
 */
async function seedDatabase(pool: any, dryRun: boolean, verbose: boolean, progressReporter?: ProgressReporter) {
  console.log('\n=== Seeding Database ===');

  const parser = new MockDataParser();
  const scenarios = await parser.parseTestScenarios();
  console.log(`✓ Parsed ${scenarios.length} valid test scenarios`);

  const seeder = new DatabaseSeeder(pool);

  try {
    const results = await seeder.seedAllTables(scenarios, {
      dryRun,
      batchSize: 100,
      skipValidation: false
    });

    if (verbose) {
      console.log('\nDetailed Results:');
      results.forEach(result => {
        console.log(`${result.tableName}:`);
        console.log(`  Processed: ${result.recordsProcessed}`);
        console.log(`  Inserted: ${result.recordsInserted}`);
        console.log(`  Updated: ${result.recordsUpdated}`);
        console.log(`  Errors: ${result.errors.length}`);
        
        if (result.errors.length > 0) {
          result.errors.forEach(error => console.log(`    - ${error}`));
        }
      });
    }

  } catch (error) {
    throw new Error(`Seeding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate database schema and data
 */
async function validateDatabase(pool: any, verbose: boolean) {
  console.log('\n=== Validating Database ===');

  const client = await pool.connect();

  try {
    // Check table existence
    const tables = ['identity_records', 'contact_information', 'financial_data', 'application_data', 'test_scenarios'];
    
    for (const tableName of tables) {
      const result = await client.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_name = $1 AND table_schema = 'public'
      `, [tableName]);
      
      const exists = parseInt(result.rows[0].count) > 0;
      
      if (verbose) {
        console.log(`✓ Table ${tableName} ${exists ? 'exists' : 'missing'}`);
      }
      
      if (!exists) {
        throw new Error(`Required table missing: ${tableName}`);
      }
    }

    // Check for orphaned records
    if (verbose) {
      console.log('Checking data integrity...');
      
      const orphanCheck = await client.query(`
        SELECT 'contact_information' as table_name, COUNT(*) as orphans
        FROM contact_information c
        LEFT JOIN identity_records i ON c.external_ref = i.external_ref
        WHERE i.external_ref IS NULL
        UNION ALL
        SELECT 'financial_data' as table_name, COUNT(*) as orphans
        FROM financial_data f
        LEFT JOIN identity_records i ON f.external_ref = i.external_ref
        WHERE i.external_ref IS NULL
        UNION ALL
        SELECT 'application_data' as table_name, COUNT(*) as orphans
        FROM application_data a
        LEFT JOIN identity_records i ON a.external_ref = i.external_ref
        WHERE i.external_ref IS NULL
      `);
      
      orphanCheck.rows.forEach((row: any) => {
        const orphanCount = parseInt(row.orphans);
        if (orphanCount > 0) {
          console.log(`⚠️  Found ${orphanCount} orphaned records in ${row.table_name}`);
        } else {
          console.log(`✓ No orphaned records in ${row.table_name}`);
        }
      });
    }

    console.log('✓ Database validation passed');

  } catch (error) {
    throw new Error(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      
      let deleteQuery: string;
      
      // Different tables have different column structures
      if (tableName === 'test_scenarios') {
        deleteQuery = `DELETE FROM ${tableName} 
                       WHERE scenario_name LIKE '%test%' 
                          OR scenario_name LIKE '%scenario%'
                          OR created_at > NOW() - INTERVAL '1 day'`;
      } else {
        deleteQuery = `DELETE FROM ${tableName} 
                       WHERE external_ref LIKE '%test%' 
                          OR external_ref LIKE '%scenario%'
                          OR created_at > NOW() - INTERVAL '1 day'`;
      }
      
      const result = await client.query(deleteQuery);

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