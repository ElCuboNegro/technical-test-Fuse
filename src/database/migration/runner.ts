import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DatabaseManager } from '../connection/database-manager';

/**
 * Migration runner for executing SQL migration files
 * Requirements addressed:
 * - 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8: Create missing database tables
 */

export interface MigrationResult {
  success: boolean;
  migrationName: string;
  executionTimeMs: number;
  error?: string;
}

export class MigrationRunner {
  private dbManager: DatabaseManager;

  constructor() {
    this.dbManager = new DatabaseManager();
  }

  /**
   * Execute a specific migration file
   */
  async executeMigration(
    migrationFileName: string, 
    environment: 'test' | 'production' = 'test'
  ): Promise<MigrationResult> {
    const startTime = Date.now();
    
    try {
      // Get database pool
      const pool = this.dbManager.getPool(environment);
      
      // Read migration file
      const migrationPath = join(process.cwd(), 'migrations', migrationFileName);
      const migrationSql = readFileSync(migrationPath, 'utf-8');
      
      // Execute migration in a transaction
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Execute the migration SQL
        await client.query(migrationSql);
        
        // Record migration in schema_migrations table (if it exists)
        try {
          await client.query(`
            INSERT INTO schema_migrations (version, name, filename, checksum, applied_at, execution_time_ms, success)
            VALUES ($1, $2, $3, $4, NOW(), $5, TRUE)
            ON CONFLICT (version) DO UPDATE SET
              applied_at = NOW(),
              execution_time_ms = EXCLUDED.execution_time_ms,
              success = TRUE
          `, [
            migrationFileName.replace('.sql', ''),
            migrationFileName.replace('.sql', '').replace(/^\d+_/, ''),
            migrationFileName,
            this.calculateChecksum(migrationSql),
            Date.now() - startTime
          ]);
        } catch (error) {
          // If schema_migrations table doesn't exist, that's okay
          console.warn('Could not record migration in schema_migrations table:', error);
        }
        
        await client.query('COMMIT');
        
        const executionTime = Date.now() - startTime;
        console.log(`✓ Migration ${migrationFileName} executed successfully in ${executionTime}ms`);
        
        return {
          success: true,
          migrationName: migrationFileName,
          executionTimeMs: executionTime
        };
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error(`✗ Migration ${migrationFileName} failed:`, errorMessage);
      
      return {
        success: false,
        migrationName: migrationFileName,
        executionTimeMs: executionTime,
        error: errorMessage
      };
    }
  }

  /**
   * Execute the missing tables migration specifically
   */
  async executeMissingTablesMigration(environment: 'test' | 'production' = 'test'): Promise<MigrationResult> {
    // First ensure the initial schema exists
    await this.ensureInitialSchema(environment);
    
    return this.executeMigration('003_missing_database_tables.sql', environment);
  }

  /**
   * Ensure initial schema exists by running prerequisite migrations
   */
  async ensureInitialSchema(environment: 'test' | 'production' = 'test'): Promise<void> {
    try {
      // Run initial schema migration first
      const initialResult = await this.executeMigration('001_initial_schema.sql', environment);
      if (!initialResult.success) {
        console.warn('Initial schema migration failed, but continuing (may already exist)');
      }

      // Run configuration tables migration
      const configResult = await this.executeMigration('002_configuration_tables.sql', environment);
      if (!configResult.success) {
        console.warn('Configuration tables migration failed, but continuing (may already exist)');
      }
    } catch (error) {
      console.warn('Error ensuring initial schema:', error);
      // Continue anyway - tables might already exist
    }
  }

  /**
   * Validate that all required tables exist
   */
  async validateTablesExist(environment: 'test' | 'production' = 'test'): Promise<boolean> {
    try {
      const pool = this.dbManager.getPool(environment);
      const client = await pool.connect();
      
      try {
        const requiredTables = [
          'identity_records',
          'contact_information', 
          'financial_data',
          'application_data',
          'test_scenarios'
        ];
        
        for (const tableName of requiredTables) {
          const result = await client.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_name = $1
            )
          `, [tableName]);
          
          if (!result.rows[0].exists) {
            console.error(`✗ Required table '${tableName}' does not exist`);
            return false;
          }
        }
        
        console.log('✓ All required tables exist');
        return true;
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('Error validating tables:', error);
      return false;
    }
  }

  /**
   * Get list of applied migrations
   */
  async getAppliedMigrations(environment: 'test' | 'production' = 'test'): Promise<string[]> {
    try {
      const pool = this.dbManager.getPool(environment);
      const client = await pool.connect();
      
      try {
        const result = await client.query(`
          SELECT version FROM schema_migrations 
          WHERE success = TRUE 
          ORDER BY applied_at
        `);
        
        return result.rows.map(row => row.version);
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      // If schema_migrations table doesn't exist, return empty array
      console.warn('Could not query schema_migrations table:', error);
      return [];
    }
  }

  /**
   * Calculate simple checksum for migration content
   */
  private calculateChecksum(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.dbManager.shutdown();
  }
}