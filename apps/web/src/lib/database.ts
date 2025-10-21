import { Pool, PoolConfig } from 'pg';
import { z } from 'zod';

// Environment variable validation schema
const DatabaseConfigSchema = z.object({
  POSTGRES_HOST: z.string().min(1, 'POSTGRES_HOST is required'),
  POSTGRES_PORT: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().min(1).max(65535)),
  POSTGRES_DB: z.string().min(1, 'POSTGRES_DB is required'),
  POSTGRES_USER: z.string().min(1, 'POSTGRES_USER is required'),
  POSTGRES_PASSWORD: z.string().min(1, 'POSTGRES_PASSWORD is required'),
  DATABASE_URL: z.string().url().optional(),
});

type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

class DatabaseConnection {
  private static instance: DatabaseConnection;
  private pool: Pool | null = null;
  private config: DatabaseConfig;

  private constructor() {
    // Validate environment variables
    const envConfig = {
      POSTGRES_HOST: process.env.POSTGRES_HOST,
      POSTGRES_PORT: process.env.POSTGRES_PORT,
      POSTGRES_DB: process.env.POSTGRES_DB,
      POSTGRES_USER: process.env.POSTGRES_USER,
      POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
      DATABASE_URL: process.env.DATABASE_URL,
    };

    try {
      this.config = DatabaseConfigSchema.parse(envConfig);
    } catch (error) {
      console.error('Database configuration validation failed:', error);
      throw new Error('Invalid database configuration. Please check your environment variables.');
    }
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  public async connect(): Promise<Pool> {
    if (this.pool) {
      return this.pool;
    }

    const poolConfig: PoolConfig = {
      host: this.config.POSTGRES_HOST,
      port: this.config.POSTGRES_PORT,
      database: this.config.POSTGRES_DB,
      user: this.config.POSTGRES_USER,
      password: this.config.POSTGRES_PASSWORD,
      // Connection pool settings
      max: 20, // Maximum number of clients in the pool
      min: 2, // Minimum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
      maxUses: 7500, // Close (and replace) a connection after it has been used 7500 times
      allowExitOnIdle: true, // Allow the pool to close all connections and exit when there are no more clients
    };

    // Use DATABASE_URL if provided, otherwise use individual config values
    if (this.config.DATABASE_URL) {
      poolConfig.connectionString = this.config.DATABASE_URL;
    }

    this.pool = new Pool(poolConfig);

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });

    // Test the connection
    try {
      const client = await this.pool.connect();
      console.log('Database connection established successfully');
      client.release();
    } catch (error) {
      console.error('Failed to connect to database:', error);
      throw error;
    }

    return this.pool;
  }

  public async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      console.log('Database connection closed');
    }
  }

  public getPool(): Pool | null {
    return this.pool;
  }

  public async query(text: string, params?: any[]): Promise<any> {
    if (!this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }
    
    try {
      const result = await this.pool.query(text, params);
      return result;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      if (!this.pool) {
        return false;
      }
      
      const result = await this.pool.query('SELECT 1 as health_check');
      return result.rows[0]?.health_check === 1;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const database = DatabaseConnection.getInstance();

// Export types for use in other modules
export type { DatabaseConfig };
export { DatabaseConfigSchema };