import { Pool } from 'pg';
import { 
  DatabaseValidator as IDatabaseValidator,
  SchemaValidationResult
} from '../interfaces/index';
import { ConfigurationManager } from '../configuration/manager';

/**
 * DatabaseValidator handles database connectivity validation and schema verification
 * 
 * Requirements addressed:
 * - 6.3: Validate database environment before operations
 * - 6.5: Provide clear logging of database environment usage
 */
export class DatabaseValidator implements IDatabaseValidator {
  private configManager: ConfigurationManager;

  constructor() {
    this.configManager = new ConfigurationManager();
  }

  /**
   * Validate database connection
   * Requirements: 6.3
   */
  async validateConnection(databaseUrl: string): Promise<boolean> {
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1, // Single connection for validation
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 1000
    });

    try {
      console.log(`Validating database connection to: ${this.maskUrl(databaseUrl)}`);
      
      const client = await pool.connect();
      
      // Test basic connectivity with a simple query
      const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
      
      console.log(`✓ Database connection successful`);
      console.log(`  PostgreSQL Version: ${result.rows[0].pg_version.split(' ')[0]} ${result.rows[0].pg_version.split(' ')[1]}`);
      console.log(`  Server Time: ${result.rows[0].current_time}`);
      
      client.release();
      return true;
    } catch (error) {
      console.error(`✗ Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    } finally {
      await pool.end();
    }
  }

  /**
   * Validate database schema exists and is complete
   * Requirements: 6.3
   */
  async validateSchema(): Promise<SchemaValidationResult> {
    const requiredTables = [
      'identity_records',
      'contact_information', 
      'financial_data',
      'application_data',
      'test_scenarios'
    ];

    const requiredIndexes = [
      'idx_identity_records_ref',
      'idx_identity_records_combo',
      'idx_contact_info_ref',
      'idx_financial_data_ref',
      'idx_application_data_ref',
      'idx_test_scenarios_name'
    ];

    // Use test environment for schema validation
    const config = this.configManager.getEnvironmentConfig('test');
    const pool = new Pool({
      connectionString: config.databaseUrl,
      max: 1,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 1000
    });

    try {
      const client = await pool.connect();
      const missingElements: string[] = [];

      // Check tables
      console.log('Validating database schema...');
      const tableResult = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      `);
      
      const existingTables = tableResult.rows.map(row => row.table_name);
      const missingTables = requiredTables.filter(table => !existingTables.includes(table));
      
      if (missingTables.length > 0) {
        missingElements.push(...missingTables.map(table => `table: ${table}`));
      }

      // Check indexes
      const indexResult = await client.query(`
        SELECT indexname 
        FROM pg_indexes 
        WHERE schemaname = 'public'
      `);
      
      const existingIndexes = indexResult.rows.map(row => row.indexname);
      const missingIndexes = requiredIndexes.filter(index => !existingIndexes.includes(index));
      
      if (missingIndexes.length > 0) {
        missingElements.push(...missingIndexes.map(index => `index: ${index}`));
      }

      // Check columns for existing tables (basic validation)
      let columnsValid = true;
      for (const table of existingTables.filter(t => requiredTables.includes(t))) {
        const columnResult = await client.query(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = $1
          ORDER BY ordinal_position
        `, [table]);

        if (columnResult.rows.length === 0) {
          columnsValid = false;
          missingElements.push(`columns for table: ${table}`);
        }
      }

      client.release();

      const result: SchemaValidationResult = {
        tablesExist: missingTables.length === 0,
        indexesExist: missingIndexes.length === 0,
        columnsValid,
        missingElements
      };

      // Log validation results
      if (result.tablesExist && result.indexesExist && result.columnsValid) {
        console.log('✓ Database schema validation passed');
      } else {
        console.warn('⚠ Database schema validation issues found:');
        result.missingElements.forEach(element => {
          console.warn(`  - Missing ${element}`);
        });
      }

      return result;
    } catch (error) {
      console.error(`✗ Schema validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        tablesExist: false,
        indexesExist: false,
        columnsValid: false,
        missingElements: ['Schema validation failed due to connection error']
      };
    } finally {
      await pool.end();
    }
  }

  /**
   * Validate environment safety before operations
   * Requirements: 6.3
   */
  async validateEnvironment(env: 'test' | 'production'): Promise<boolean> {
    try {
      console.log(`Validating ${env} environment...`);
      
      const config = this.configManager.getEnvironmentConfig(env);
      
      // Validate connection
      const connectionValid = await this.validateConnection(config.databaseUrl);
      if (!connectionValid) {
        console.error(`✗ ${env} environment validation failed: Cannot connect to database`);
        return false;
      }

      // Additional safety checks for production
      if (env === 'production') {
        if (config.isTestEnvironment) {
          console.error('✗ Production environment validation failed: Database URL appears to be a test database');
          return false;
        }
        console.log('✓ Production environment validation passed');
      } else {
        // Test environment
        if (!config.isTestEnvironment) {
          console.warn('⚠ Test environment using production-like database URL');
        }
        console.log('✓ Test environment validation passed');
      }

      return true;
    } catch (error) {
      console.error(`✗ Environment validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Check which required tables are missing
   * Requirements: 6.3
   */
  async checkRequiredTables(): Promise<string[]> {
    const requiredTables = [
      'identity_records',
      'contact_information',
      'financial_data', 
      'application_data',
      'test_scenarios'
    ];

    const config = this.configManager.getEnvironmentConfig('test');
    const pool = new Pool({
      connectionString: config.databaseUrl,
      max: 1,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 1000
    });

    try {
      const client = await pool.connect();
      
      const result = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name = ANY($1)
      `, [requiredTables]);
      
      const existingTables = result.rows.map(row => row.table_name);
      const missingTables = requiredTables.filter(table => !existingTables.includes(table));
      
      client.release();
      
      if (missingTables.length > 0) {
        console.log(`Missing required tables: ${missingTables.join(', ')}`);
      } else {
        console.log('✓ All required tables exist');
      }
      
      return missingTables;
    } catch (error) {
      console.error(`Error checking required tables: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return requiredTables; // Assume all missing if we can't check
    } finally {
      await pool.end();
    }
  }

  /**
   * Mask sensitive parts of database URL for logging
   */
  private maskUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const maskedPassword = urlObj.password ? '***' : '';
      return `${urlObj.protocol}//${urlObj.username}:${maskedPassword}@${urlObj.host}${urlObj.pathname}`;
    } catch {
      return url.replace(/:[^:@]+@/, ':***@');
    }
  }
}