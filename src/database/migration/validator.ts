// Migration Validator - validates migration files and database state

import { Migration, ValidationResult } from '../interfaces';
import * as fs from 'fs';
import * as path from 'path';

export class MigrationValidator {
  private migrationsPath: string;

  constructor(migrationsPath: string = './migrations') {
    this.migrationsPath = migrationsPath;
  }

  /**
   * Validate all migration files in the migrations directory
   */
  async validateAllMigrations(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const migrationFiles = await this.getMigrationFiles();
      
      // Check for duplicate versions
      const versions = migrationFiles.map(f => this.extractVersion(f));
      const duplicateVersions = this.findDuplicates(versions);
      
      if (duplicateVersions.length > 0) {
        errors.push(`Duplicate migration versions found: ${duplicateVersions.join(', ')}`);
      }

      // Validate each migration file
      for (const file of migrationFiles) {
        const fileValidation = await this.validateMigrationFile(file);
        errors.push(...fileValidation.errors);
        warnings.push(...(fileValidation.warnings || []));
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Failed to validate migrations: ${error.message}`]
      };
    }
  }

  /**
   * Validate a single migration file
   */
  async validateMigrationFile(filename: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check filename format
      if (!this.isValidMigrationFilename(filename)) {
        errors.push(`Invalid migration filename format: ${filename}`);
        return { isValid: false, errors };
      }

      // Check if file exists
      const filePath = path.join(this.migrationsPath, filename);
      if (!fs.existsSync(filePath)) {
        errors.push(`Migration file not found: ${filename}`);
        return { isValid: false, errors };
      }

      // Read and validate content
      const content = fs.readFileSync(filePath, 'utf8');
      if (!content.trim()) {
        errors.push(`Migration file is empty: ${filename}`);
      }

      // Check for rollback file
      const rollbackPath = path.join(this.migrationsPath, 'rollbacks', this.getRollbackFilename(filename));
      if (!fs.existsSync(rollbackPath)) {
        warnings.push(`No rollback file found for migration: ${filename}`);
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Failed to validate migration file ${filename}: ${error.message}`]
      };
    }
  }

  /**
   * Check if filename follows migration naming convention
   */
  isValidMigrationFilename(filename: string): boolean {
    return /^\d{3}_[a-z0-9_]+\.sql$/.test(filename);
  }

  /**
   * Extract version number from migration filename
   */
  extractVersion(filename: string): string {
    const match = filename.match(/^(\d{3})_/);
    return match ? match[1] : '';
  }

  /**
   * Get rollback filename for a migration
   */
  getRollbackFilename(migrationFilename: string): string {
    return migrationFilename.replace('.sql', '_rollback.sql');
  }

  /**
   * Get all migration files from the migrations directory
   */
  private async getMigrationFiles(): Promise<string[]> {
    const files = fs.readdirSync(this.migrationsPath);
    return files
      .filter(file => file.endsWith('.sql'))
      .filter(file => this.isValidMigrationFilename(file))
      .sort();
  }

  /**
   * Find duplicate values in an array
   */
  private findDuplicates(array: string[]): string[] {
    const seen = new Set();
    const duplicates = new Set();
    
    for (const item of array) {
      if (seen.has(item)) {
        duplicates.add(item);
      } else {
        seen.add(item);
      }
    }
    
    return Array.from(duplicates);
  }
}