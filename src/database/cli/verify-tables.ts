#!/usr/bin/env node

import { config } from 'dotenv';
import { DatabaseManager } from '../connection/database-manager';

// Load environment variables from .env file
config();

/**
 * CLI script for verifying database tables and their structure
 * Usage: tsx src/database/cli/verify-tables.ts [--env=test|production]
 */

async function main() {
  const args = process.argv.slice(2);
  const envArg = args.find(arg => arg.startsWith('--env='));
  const environment = envArg ? envArg.split('=')[1] as 'test' | 'production' : 'test';

  if (environment !== 'test' && environment !== 'production') {
    console.error('Error: Environment must be either "test" or "production"');
    process.exit(1);
  }

  console.log(`Verifying database tables for ${environment} environment...`);

  const dbManager = new DatabaseManager();

  try {
    const pool = dbManager.getPool(environment);
    const client = await pool.connect();

    try {
      // Check all required tables exist
      const tables = [
        'identity_records',
        'contact_information', 
        'financial_data',
        'application_data',
        'test_scenarios',
        'system_variables',
        'response_templates'
      ];

      console.log('\n=== Table Existence Check ===');
      for (const tableName of tables) {
        const result = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )
        `, [tableName]);
        
        const exists = result.rows[0].exists;
        console.log(`${exists ? '✓' : '✗'} ${tableName}: ${exists ? 'EXISTS' : 'MISSING'}`);
      }

      // Check table structures
      console.log('\n=== Table Structure Check ===');
      
      // Check contact_information table structure
      const contactColumns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'contact_information' 
        ORDER BY ordinal_position
      `);
      
      console.log('\ncontact_information columns:');
      contactColumns.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });

      // Check financial_data table structure
      const financialColumns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'financial_data' 
        ORDER BY ordinal_position
      `);
      
      console.log('\nfinancial_data columns:');
      financialColumns.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });

      // Check foreign key constraints
      console.log('\n=== Foreign Key Constraints ===');
      const constraints = await client.query(`
        SELECT 
          tc.table_name, 
          tc.constraint_name, 
          tc.constraint_type,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name 
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name IN ('contact_information', 'financial_data', 'application_data')
        ORDER BY tc.table_name
      `);

      constraints.rows.forEach(constraint => {
        console.log(`✓ ${constraint.table_name}.${constraint.column_name} → ${constraint.foreign_table_name}.${constraint.foreign_column_name}`);
      });

      // Check indexes
      console.log('\n=== Index Check ===');
      const indexes = await client.query(`
        SELECT 
          schemaname,
          tablename,
          indexname,
          indexdef
        FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename IN ('contact_information', 'financial_data', 'application_data', 'test_scenarios')
        ORDER BY tablename, indexname
      `);

      indexes.rows.forEach(index => {
        console.log(`✓ ${index.tablename}: ${index.indexname}`);
      });

      console.log('\n✓ Database verification completed successfully');

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('✗ Database verification failed:', error);
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