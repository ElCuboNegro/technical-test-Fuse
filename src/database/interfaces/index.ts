// Core interfaces for the database seeding and migration system

export interface DatabaseConfiguration {
  testDatabaseUrl?: string;
  productionDatabaseUrl: string;
  ssnSalt: string;
  dobSalt?: string;
}

export interface EnvironmentConfig {
  environment: 'test' | 'production';
  databaseUrl: string;
  isTestEnvironment: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface HashingSalts {
  ssnSalt: string;
  dobSalt?: string;
}

// Configuration Management Interface
export interface ConfigurationManager {
  getDatabaseUrl(environment: 'test' | 'production'): string;
  validateEnvironmentVariables(): ValidationResult;
  getHashingSalts(): HashingSalts;
  isTestEnvironment(databaseUrl: string): boolean;
  getEnvironmentConfig(environment: 'test' | 'production'): EnvironmentConfig;
}

// Database Connection and Validation Interfaces
export interface DatabaseValidator {
  validateConnection(databaseUrl: string): Promise<boolean>;
  validateSchema(): Promise<SchemaValidationResult>;
  validateEnvironment(env: 'test' | 'production'): Promise<boolean>;
  checkRequiredTables(): Promise<string[]>;
}

export interface SchemaValidationResult {
  tablesExist: boolean;
  indexesExist: boolean;
  columnsValid: boolean;
  missingElements: string[];
}

// Migration System Interfaces
export interface Migration {
  version: string;
  name: string;
  filename: string;
  up: string;
  down: string;
  checksum: string;
  appliedAt?: Date;
}

export interface MigrationResult {
  success: boolean;
  appliedMigrations: string[];
  errors: MigrationError[];
  currentVersion: string;
}

export interface MigrationError {
  migration: string;
  error: string;
  rollbackRequired: boolean;
}

export interface MigrationManager {
  runMigrations(environment: 'test' | 'production'): Promise<MigrationResult>;
  rollbackMigration(version: string): Promise<MigrationResult>;
  getCurrentVersion(): Promise<string>;
  getPendingMigrations(): Promise<Migration[]>;
  createMigration(name: string): Promise<string>;
  validateMigrations(): Promise<ValidationResult>;
}

// Test Scenario Data Interfaces
export interface TestScenario {
  scenario_name: string;
  description: string;
  applicant_data: ApplicantData;
  expected_flow: string[];
  expected_outcome: string;
  failure_reason?: string;
}

export interface ApplicantData {
  name: string;
  date_of_birth?: string;
  correct_date_of_birth?: string;
  provided_date_of_birth?: string;
  ssn_last_four?: string;
  correct_ssn_last_four?: string;
  provided_ssn_last_four?: string;
  mailing_address?: MailingAddress;
  initial_address?: string;
  complete_address?: MailingAddress;
  email?: string;
  monthly_income?: number;
  job_tenure_months?: number;
  application_job_tenure?: number;
  employment_status?: string;
  job_change_reason?: string;
  first_attempt?: AttemptData;
  second_attempt?: AttemptData;
}

export interface MailingAddress {
  street: string;
  unit?: string;
  city: string;
  state: string;
  zip_code: string;
}

export interface AttemptData {
  date_of_birth: string;
  ssn_last_four: string;
}

// Database Record Interfaces
export interface ProcessedIdentityRecord {
  external_ref: string;
  name: string;
  dob: Date;
  dob_hash: string;
  ssn4_hash: string;
  created_at: Date;
  updated_at: Date;
}

export interface ProcessedContactRecord {
  external_ref: string;
  street: string;
  unit?: string;
  city: string;
  state: string;
  zip_code: string;
  email?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ProcessedFinancialRecord {
  external_ref: string;
  monthly_income: number;
  job_tenure_months?: number;
  employment_status: string;
  job_change_reason?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ProcessedApplicationRecord {
  external_ref: string;
  application_job_tenure?: number;
  initial_address?: string;
  complete_address?: any;
  first_attempt?: any;
  second_attempt?: any;
  created_at: Date;
  updated_at: Date;
}

export interface ProcessedScenarioRecord {
  scenario_name: string;
  description: string;
  expected_flow: string[];
  expected_outcome: string;
  failure_reason?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ProcessedRecords {
  identity: ProcessedIdentityRecord;
  contact?: ProcessedContactRecord;
  financial?: ProcessedFinancialRecord;
  application?: ProcessedApplicationRecord;
  scenario: ProcessedScenarioRecord;
}

// Seeding Result Interfaces
export interface SeedResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: SeedError[];
}

export interface SeedError {
  record: string;
  error: string;
  recoverable: boolean;
}

export interface ComprehensiveSeedResult {
  identity: SeedResult;
  contact: SeedResult;
  financial: SeedResult;
  application: SeedResult;
  scenarios: SeedResult;
  systemVariables: SeedResult;
  responseTemplates: SeedResult;
  totalRecords: number;
  errors: SeedError[];
}

// CLI Interfaces
export interface CLIOptions {
  environment: 'test' | 'production';
  confirm: boolean;
  dryRun: boolean;
  verbose: boolean;
  batchSize?: number;
  version?: string;
  name?: string;
}