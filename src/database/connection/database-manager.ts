import { Pool, PoolConfig } from 'pg';
import { ConfigurationManager } from '../configuration/manager';

/**
 * DatabaseManager handles connection pooling and lifecycle management
 * for database operations across different environments.
 * 
 * Requirements addressed:
 * - 6.1: Support environment-specific database URL resolution
 * - 6.2: Connection validation and error handling
 * - 6.3: Database connection pooling and lifecycle management
 */

export interface PoolStatistics {
  environment: 'test' | 'production';
  totalConnections: number;
  idleConnections: number;
  waitingConnections: number;
  activeConnections: number;
}

export interface DatabaseManagerConfig {
  max?: number;
  min?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  allowExitOnIdle?: boolean;
}

export class DatabaseManager {
  private pools: Map<string, Pool> = new Map();
  private configManager: ConfigurationManager;
  private initialized: boolean = false;
  private shutDown: boolean = false;
  private errorHandlers: Array<(error: Error, environment: string) => void> = [];

  constructor() {
    this.configManager = new ConfigurationManager();
  }

  /**
   * Get or create connection pool for specified environment
   */
  getPool(environment: 'test' | 'production', customConfig?: DatabaseManagerConfig): Pool {
    if (this.shutDown) {
      throw new Error('DatabaseManager has been shut down');
    }

    const poolKey = environment;
    
    if (this.pools.has(poolKey)) {
      return this.pools.get(poolKey)!;
    }

    // Validate environment and get configuration
    const envConfig = this.configManager.getEnvironmentConfig(environment);
    
    // Create pool configuration
    const poolConfig: PoolConfig = {
      connectionString: envConfig.databaseUrl,
      ...this.getDefaultPoolConfig(environment),
      ...customConfig
    };

    // Create new pool
    const pool = new Pool(poolConfig);
    
    // Set up error handling
    pool.on('error', (error) => {
      this.handlePoolError(error, environment);
    });

    this.pools.set(poolKey, pool);
    return pool;
  }

  /**
   * Initialize database connections and validate connectivity
   */
  async initialize(): Promise<void> {
    try {
      // Create pools for both environments
      const testPool = this.getPool('test');
      const prodPool = this.getPool('production');

      // Validate connections
      const testHealthy = await this.validateConnection('test');
      const prodHealthy = await this.validateConnection('production');

      if (!testHealthy || !prodHealthy) {
        throw new Error('Failed to validate database connections during initialization');
      }

      this.initialized = true;
      console.log('✓ Database connections initialized successfully');
    } catch (error) {
      this.initialized = false;
      throw new Error(`Failed to initialize database connections: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if DatabaseManager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Gracefully shutdown all connection pools
   */
  async shutdown(): Promise<void> {
    const shutdownPromises: Promise<void>[] = [];

    for (const [environment, pool] of this.pools) {
      shutdownPromises.push(
        pool.end().catch(error => {
          console.error(`Error shutting down ${environment} pool:`, error);
        })
      );
    }

    await Promise.all(shutdownPromises);
    
    this.pools.clear();
    this.shutDown = true;
    this.initialized = false;
    
    console.log('✓ Database connections shut down successfully');
  }

  /**
   * Validate connection health for specified environment
   */
  async validateConnection(environment: 'test' | 'production'): Promise<boolean> {
    try {
      const pool = this.getPool(environment);
      const client = await pool.connect();
      
      try {
        await client.query('SELECT NOW() as current_time, version() as pg_version');
        return true;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`Connection validation failed for ${environment}:`, error);
      return false;
    }
  }

  /**
   * Validate connection with retry logic and exponential backoff
   */
  async validateConnectionWithRetry(
    environment: 'test' | 'production', 
    maxRetries: number = 3, 
    baseDelayMs: number = 1000
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const isHealthy = await this.validateConnection(environment);
      
      if (isHealthy) {
        return true;
      }

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.log(`Connection attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.error(`Connection validation failed after ${maxRetries} attempts for ${environment}`);
    return false;
  }

  /**
   * Get database URL for specified environment
   */
  getDatabaseUrl(environment: 'test' | 'production'): string {
    return this.configManager.getDatabaseUrl(environment);
  }

  /**
   * Get pool statistics for specified environment
   */
  getPoolStats(environment: 'test' | 'production'): PoolStatistics | null {
    const pool = this.pools.get(environment);
    
    if (!pool) {
      return null;
    }

    return {
      environment,
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingConnections: pool.waitingCount,
      activeConnections: pool.totalCount - pool.idleCount
    };
  }

  /**
   * Get statistics for all pools
   */
  getAllPoolStats(): PoolStatistics[] {
    const stats: PoolStatistics[] = [];
    
    for (const environment of this.pools.keys()) {
      const poolStats = this.getPoolStats(environment as 'test' | 'production');
      if (poolStats) {
        stats.push(poolStats);
      }
    }
    
    return stats;
  }

  /**
   * Check health of all connections
   */
  async checkAllConnectionsHealth(): Promise<Record<string, boolean>> {
    const healthStatus: Record<string, boolean> = {};
    
    for (const environment of this.pools.keys()) {
      healthStatus[environment] = await this.validateConnection(environment as 'test' | 'production');
    }
    
    return healthStatus;
  }

  /**
   * Register error handler for pool errors
   */
  onPoolError(handler: (error: Error, environment: string) => void): void {
    this.errorHandlers.push(handler);
  }

  /**
   * Handle pool errors
   */
  private handlePoolError(error: Error, environment: string): void {
    console.error(`Pool error in ${environment} environment:`, error);
    
    // Notify registered error handlers
    this.errorHandlers.forEach(handler => {
      try {
        handler(error, environment);
      } catch (handlerError) {
        console.error('Error in pool error handler:', handlerError);
      }
    });
  }

  /**
   * Get default pool configuration for environment
   */
  private getDefaultPoolConfig(environment: 'test' | 'production'): DatabaseManagerConfig {
    if (environment === 'test') {
      return {
        max: 10,
        min: 2,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        allowExitOnIdle: true
      };
    } else {
      return {
        max: 20,
        min: 5,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 60000,
        allowExitOnIdle: false
      };
    }
  }
}