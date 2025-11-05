#!/usr/bin/env node

/**
 * Spontime Database Setup CLI
 * 
 * This script helps set up the Spontime database schema and seed data.
 * 
 * Usage:
 *   npm run spontime:setup          - Apply migrations and seed data
 *   npm run spontime:migrate        - Apply migrations only
 *   npm run spontime:seed           - Seed data only (requires migrations)
 *   npm run spontime:reset          - Drop Spontime tables and recreate
 */

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const command = args[0] || 'setup';

// Database configuration from environment
const databaseUrl = process.env.DATABASE_URL || 
  `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`;

const pool = new Pool({
  connectionString: databaseUrl,
});

async function runMigration() {
  console.log('📦 Applying Spontime schema migration...');
  
  try {
    const migrationPath = join(__dirname, '../../migrations/004_spontime_schema.sql');
    const migrationSql = readFileSync(migrationPath, 'utf-8');
    
    await pool.query(migrationSql);
    console.log('✅ Migration applied successfully!');
    return true;
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return false;
  }
}

async function seedData() {
  console.log('🌱 Seeding Spontime test data...');
  
  try {
    const seedPath = join(__dirname, '../../migrations/seed_spontime_data.sql');
    const seedSql = readFileSync(seedPath, 'utf-8');
    
    await pool.query(seedSql);
    console.log('✅ Data seeded successfully!');
    return true;
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    return false;
  }
}

async function resetDatabase() {
  console.log('🗑️  Dropping Spontime tables...');
  
  try {
    await pool.query(`
      DROP TABLE IF EXISTS message_rate_limits CASCADE;
      DROP TABLE IF EXISTS messages CASCADE;
      DROP TABLE IF EXISTS plan_members CASCADE;
      DROP TABLE IF EXISTS plan_tags CASCADE;
      DROP TABLE IF EXISTS plans CASCADE;
      DROP TABLE IF EXISTS interest_tags CASCADE;
      DROP TABLE IF EXISTS spontime_users CASCADE;
      DROP FUNCTION IF EXISTS update_plan_location_point() CASCADE;
    `);
    console.log('✅ Spontime tables dropped!');
    return true;
  } catch (error) {
    console.error('❌ Reset failed:', error);
    return false;
  }
}

async function checkTables() {
  console.log('🔍 Checking Spontime tables...');
  
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN (
          'spontime_users', 
          'plans', 
          'interest_tags', 
          'plan_tags', 
          'plan_members', 
          'messages',
          'message_rate_limits'
        )
      ORDER BY table_name;
    `);
    
    const tables = result.rows.map(row => row.table_name);
    
    console.log(`\nFound ${tables.length}/7 Spontime tables:`);
    tables.forEach(table => console.log(`  ✓ ${table}`));
    
    const missing = ['spontime_users', 'plans', 'interest_tags', 'plan_tags', 'plan_members', 'messages', 'message_rate_limits']
      .filter(t => !tables.includes(t));
    
    if (missing.length > 0) {
      console.log(`\nMissing tables:`);
      missing.forEach(table => console.log(`  ✗ ${table}`));
    }
    
    return tables.length === 7;
  } catch (error) {
    console.error('❌ Check failed:', error);
    return false;
  }
}

async function main() {
  console.log('🚀 Spontime Database Setup\n');
  
  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('✅ Database connection successful\n');
    
    switch (command) {
      case 'setup':
        await runMigration();
        await seedData();
        await checkTables();
        break;
        
      case 'migrate':
        await runMigration();
        await checkTables();
        break;
        
      case 'seed':
        await seedData();
        break;
        
      case 'reset':
        await resetDatabase();
        await runMigration();
        await seedData();
        await checkTables();
        break;
        
      case 'check':
        await checkTables();
        break;
        
      default:
        console.log('Unknown command. Use: setup, migrate, seed, reset, or check');
    }
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
  
  console.log('\n✨ Done!');
}

main();
