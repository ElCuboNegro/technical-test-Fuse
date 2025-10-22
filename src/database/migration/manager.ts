// Migration Manager - simple wrapper around node-pg-migrate

import { MigrationManager as IMigrationManager } from '../interfaces';
import { ConfigurationManager } from '../configuration';
import { spawn } from 'child_process';

export class MigrationManager implements IMigrationManager {
  private configManager: ConfigurationManager;

  constructor() {
    this.configManager = new ConfigurationManager();
  }

  /**
   * Run pending migrations using node-pg-migrate
   */
  async runMigrations(environment: 'test' | 'production'): Promise<void> {
    const databaseUrl = this.getDatabaseUrl(environment);
    
    return new Promise((resolve, reject) => {
      const migrationProcess = spawn('npx', ['node-pg-migrate', 'up'], {
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl
        },
        stdio: 'inherit'
      });

      migrationProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Migration failed with exit code ${code}`));
        }
      });

      migrationProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Rollback migrations using node-pg-migrate
   */
  async rollbackMigrations(count: number, environment: 'test' | 'production'): Promise<void> {
    const databaseUrl = this.getDatabaseUrl(environment);
    
    return new Promise((resolve, reject) => {
      const migrationProcess = spawn('npx', ['node-pg-migrate', 'down', count.toString()], {
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl
        },
        stdio: 'inherit'
      });

      migrationProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Migration rollback failed with exit code ${code}`));
        }
      });

      migrationProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Create new migration file using node-pg-migrate
   */
  async createMigration(name: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const migrationProcess = spawn('npx', ['node-pg-migrate', 'create', name], {
        stdio: 'pipe'
      });

      let output = '';
      migrationProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });

      migrationProcess.on('close', (code) => {
        if (code === 0) {
          // Extract filename from output
          const match = output.match(/Created migration -- (.+)/);
          const filename = match ? match[1] : `migration_${name}`;
          resolve(filename);
        } else {
          reject(new Error(`Migration creation failed with exit code ${code}`));
        }
      });

      migrationProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get database URL for environment
   */
  getDatabaseUrl(environment: 'test' | 'production'): string {
    return this.configManager.getDatabaseUrl(environment);
  }
}