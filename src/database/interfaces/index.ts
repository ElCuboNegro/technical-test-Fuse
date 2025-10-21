/**
 * Database interfaces and types for the seeding system
 * Requirements addressed: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */

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
  dobSalt: string;
}

export interface ConfigurationManager {
  getDatabaseUrl(environment: 'test' | 'production'): string;
  validateEnvironmentVariables(): ValidationResult;
  getHashingSalts(): HashingSalts;
  isTestEnvironment(databaseUrl: string): boolean;
  getEnvironmentConfig(environment: 'test' | 'production'): EnvironmentConfig;
}

// Test scenario interfaces matching mock_test_data.json structure
export interface ApplicantData {
  name: string;
  date_of_birth?: string;
  ssn_last_four?: string;
  correct_date_of_birth?: string;
  correct_ssn_last_four?: string;
  provided_date_of_birth?: string;
  provided_ssn_last_four?: string;
  mailing_address?: MailingAddress;
  complete_address?: MailingAddress;
  initial_address?: string;
  email?: string | null;
  monthly_income?: number;
  job_tenure_months?: number | null;
  application_job_tenure?: number;
  employment_status?: string;
  job_change_reason?: string;
  first_attempt?: IdentityAttempt;
  second_attempt?: IdentityAttempt;
}

export interface MailingAddress {
  street: string;
  unit?: string | null;
  city: string;
  state: string;
  zip_code: string;
}

export interface IdentityAttempt {
  date_of_birth: string;
  ssn_last_four: string;
}

export interface TestScenario {
  scenario_name: string;
  description: string;
  applicant_data: ApplicantData;
  expected_flow: string[];
  expected_outcome: string;
  failure_reason?: string;
}

export interface MockTestData {
  test_scenarios: TestScenario[];
  system_variables: {
    job_tenure_threshold_months: number;
    max_identity_attempts: number;
    required_fields: string[];
    optional_fields: string[];
  };
  response_templates: Record<string, string>;
}

// Database table interfaces
export interface IdentityRecord {
  id?: string;
  external_ref: string;
  name: string;
  dob: string;
  dob_hash: string;
  ssn4_hash: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface ContactInformation {
  id?: string;
  external_ref: string;
  street_address: string;
  unit_number?: string | null;
  city: string;
  state: string;
  zip_code: string;
  email?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface FinancialData {
  id?: string;
  external_ref: string;
  monthly_income: number;
  job_tenure_months?: number | null;
  employment_status: string;
  application_job_tenure?: number | null;
  job_change_reason?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface ApplicationData {
  id?: string;
  external_ref: string;
  application_id?: string | null;
  application_date?: Date;
  status: string;
  notes?: string | null;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

export interface TestScenarioRecord {
  id?: string;
  scenario_name: string;
  description: string;
  expected_outcome: string;
  scenario_type: string;
  expected_flow?: any;
  failure_reason?: string | null;
  applicant_name?: string | null;
  created_at?: Date;
  updated_at?: Date;
}