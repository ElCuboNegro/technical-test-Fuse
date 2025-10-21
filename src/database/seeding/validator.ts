// Database Validator - validates database connectivity and schema

import { DatabaseValidator as IDatabaseValidator, SchemaValidationResult } from '../interfaces';
import { Pool } from 'pg';

export class DatabaseValidator implements IDatabaseValidator {
  private databaseUrl: string;
  private pool?: Pool;

  constructor(databaseUrl: string) {
    this.databaseUrl = databaseUrl;
  }

  async validateConnection(databaseUrl: string): Promise<boolean> {
    let testPool: Pool | undefined;
    
    try {
      testPool = new Pool({
        connectionString: databaseUrl,
        max: 1,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 1000
      });

      // Test the connection
      const client = await testPool.connect();
      await client.query('SELECT 1');
      client.release();
      
      return true;
    } catch (error) {
      console.error('Database connection validation failed:', error.message);
      return false;
    } finally {
      if (testPool) {
        await testPool.end();
      }
    }
  }

  async validateSchema(): Promise<SchemaValidationResult> {
    const pool = this.getPool();
    const missingElements: string[] = [];

    try {
      // Check required tables
      const requiredTables = [
        'schema_migrations',
        'identity_records',
        'contact_information',
        'financial_data',
        'application_data',
        'test_scenarios'
      ];

      const existingTables = await this.getExistingTables(pool);
      const missingTables = requiredTables.filter(table => !existingTables.includes(table));
      
      if (missingTables.length > 0) {
        missingElements.push(...missingTables.map(table => `table: ${table}`));
      }

      // Check required indexes
      const requiredIndexes = [
        'idx_identity_records_ref',
        'idx_identity_records_combo',
        'idx_contact_info_ref',
        'idx_financial_data_ref',
        'idx_application_data_ref',
        'idx_test_scenarios_name'
      ];

      const existingIndexes = await this.getExistingIndexes(pool);
      const missingIndexes = requiredIndexes.filter(index => !existingIndexes.includes(index));
      
      if (missingIndexes.length > 0) {
        missingElements.push(...missingIndexes.map(index => `index: ${index}`));
      }

      // Validate columns for critical tables
      const columnValidation = await this.validateTableColumns(pool);
      if (!columnValidation.isValid) {
        missingElements.push(...columnValidation.missingColumns);
      }

      return {
        tablesExist: missingTables.length === 0,
        indexesExist: missingIndexes.length === 0,
        columnsValid: columnValidation.isValid,
        missingElements
      };
    } catch (error) {
      throw new Error(`Schema validation failed: ${error.message}`);
    }
  }

  async validateEnvironment(env: 'test' | 'production'): Promise<boolean> {
    try {
      const pool = this.getPool();
      
      // Check database name to ensure we're connecting to the right environment
      const result = await pool.query('SELECT current_database()');
      const databaseName = result.rows[0].current_database;
      
      const isTestDatabase = this.isTestDatabaseName(databaseName);
      
      if (env === 'test' && !isTestDatabase) {
        console.warn(`Warning: Expected test database but connected to: ${databaseName}`);
        return false;
      }
      
      if (env === 'production' && isTestDatabase) {
        console.error(`Error: Cannot run production operations on test database: ${databaseName}`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Environment validation failed:', error.message);
      return false;
    }
  }

  async checkRequiredTables(): Promise<string[]> {
    const pool = this.getPool();
    
    try {
      const existingTables = await this.getExistingTables(pool);
      const requiredTables = [
        'schema_migrations',
        'identity_records',
        'contact_information',
        'financial_data',
        'application_data',
        'test_scenarios'
      ];
      
      return requiredTables.filter(table => !existingTables.includes(table));
    } catch (error) {
      throw new Error(`Failed to check required tables: ${error.message}`);
    }
  }

  private getPool(): Pool {
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: this.databaseUrl,
        max: 5,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000
      });
    }
    return this.pool;
  }

  private async getExistingTables(pool: Pool): Promise<string[]> {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);
    
    return result.rows.map(row => row.table_name);
  }

  private async getExistingIndexes(pool: Pool): Promise<string[]> {
    const result = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public'
    `);
    
    return result.rows.map(row => row.indexname);
  }

  private async validateTableColumns(pool: Pool): Promise<{ isValid: boolean; missingColumns: string[] }> {
    const missingColumns: string[] = [];
    
    // Define required columns for each table
    const requiredColumns = {
      identity_records: ['id', 'external_ref', 'name', 'dob', 'dob_hash', 'ssn4_hash', 'created_at', 'updated_at'],
      contact_information: ['id', 'external_ref', 'street', 'city', 'state', 'zip_code', 'created_at', 'updated_at'],
      financial_data: ['id', 'external_ref', 'monthly_income', 'employment_status', 'created_at', 'updated_at'],
      application_data: ['id', 'external_ref', 'created_at', 'updated_at'],
      test_scenarios: ['id', 'scenario_name', 'description', 'expected_flow', 'expected_outcome', 'created_at', 'updated_at']
    };

    for (const [tableName, columns] of Object.entries(requiredColumns)) {
      try {
        const result = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = $1
        `, [tableName]);
        
        const existingColumns = result.rows.map(row => row.column_name);
        const missing = columns.filter(col => !existingColumns.includes(col));
        
        if (missing.length > 0) {
          missingColumns.push(...missing.map(col => `${tableName}.${col}`));
        }
      } catch (error) {
        // Table doesn't exist, will be caught by table validation
        continue;
      }
    }

    return {
      isValid: missingColumns.length === 0,
      missingColumns
    };
  }

  private isTestDatabaseName(databaseName: string): boolean {
    const testIndicators = ['test', 'testing', 'dev', 'development'];
    const name = databaseName.toLowerCase();
    
    return testIndicators.some(indicator => 
      name.includes(`_${indicator}`) || 
      name.includes(`${indicator}_`) || 
      name.endsWith(`_${indicator}`) ||
      name.startsWith(`${indicator}_`)
    );
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = undefined;
    }
  }
}