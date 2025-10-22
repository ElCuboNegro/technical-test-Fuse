-- Migration: 003_missing_database_tables
-- Description: Create missing database tables for contact_information, financial_data, application_data, and test_scenarios
-- Author: System
-- Date: 2024-12-21
-- Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8

-- Create contact_information table
CREATE TABLE IF NOT EXISTS contact_information (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref TEXT UNIQUE NOT NULL,
  street_address TEXT NOT NULL,
  unit_number TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_contact_external_ref FOREIGN KEY (external_ref) REFERENCES identity_records(external_ref) ON DELETE CASCADE
);

-- Create financial_data table
CREATE TABLE IF NOT EXISTS financial_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref TEXT UNIQUE NOT NULL,
  monthly_income DECIMAL(10,2) NOT NULL,
  job_tenure_months INTEGER,
  employment_status TEXT DEFAULT 'employed',
  application_job_tenure INTEGER,
  job_change_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_financial_external_ref FOREIGN KEY (external_ref) REFERENCES identity_records(external_ref) ON DELETE CASCADE
);

-- Create application_data table
CREATE TABLE IF NOT EXISTS application_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref TEXT UNIQUE NOT NULL,
  application_id TEXT,
  application_date TIMESTAMP DEFAULT NOW(),
  status TEXT DEFAULT 'pending',
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_application_external_ref FOREIGN KEY (external_ref) REFERENCES identity_records(external_ref) ON DELETE CASCADE
);

-- Create test_scenarios table
CREATE TABLE IF NOT EXISTS test_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_name TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  expected_outcome TEXT NOT NULL,
  scenario_type TEXT NOT NULL DEFAULT 'standard',
  expected_flow JSONB,
  failure_reason TEXT,
  applicant_name TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for contact_information
CREATE INDEX IF NOT EXISTS idx_contact_external_ref ON contact_information (external_ref);
CREATE INDEX IF NOT EXISTS idx_contact_email ON contact_information (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_state_city ON contact_information (state, city);

-- Create indexes for financial_data
CREATE INDEX IF NOT EXISTS idx_financial_external_ref ON financial_data (external_ref);
CREATE INDEX IF NOT EXISTS idx_financial_income ON financial_data (monthly_income);
CREATE INDEX IF NOT EXISTS idx_financial_tenure ON financial_data (job_tenure_months) WHERE job_tenure_months IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financial_employment_status ON financial_data (employment_status);

-- Create indexes for application_data
CREATE INDEX IF NOT EXISTS idx_application_external_ref ON application_data (external_ref);
CREATE INDEX IF NOT EXISTS idx_application_id ON application_data (application_id) WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_application_status ON application_data (status);
CREATE INDEX IF NOT EXISTS idx_application_date ON application_data (application_date);

-- Create indexes for test_scenarios
CREATE INDEX IF NOT EXISTS idx_test_scenarios_name ON test_scenarios (scenario_name);
CREATE INDEX IF NOT EXISTS idx_test_scenarios_type ON test_scenarios (scenario_type);
CREATE INDEX IF NOT EXISTS idx_test_scenarios_outcome ON test_scenarios (expected_outcome);

-- Add constraints for data validation (only if they don't exist)
DO $$
BEGIN
  -- Contact information constraints
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_contact_state_length') THEN
    ALTER TABLE contact_information ADD CONSTRAINT chk_contact_state_length CHECK (LENGTH(state) >= 2);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_contact_zip_format') THEN
    ALTER TABLE contact_information ADD CONSTRAINT chk_contact_zip_format CHECK (zip_code ~ '^\d{5}(-\d{4})?$');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_contact_email_format') THEN
    ALTER TABLE contact_information ADD CONSTRAINT chk_contact_email_format CHECK (email IS NULL OR email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
  END IF;

  -- Financial data constraints
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_financial_income_positive') THEN
    ALTER TABLE financial_data ADD CONSTRAINT chk_financial_income_positive CHECK (monthly_income > 0);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_financial_tenure_non_negative') THEN
    ALTER TABLE financial_data ADD CONSTRAINT chk_financial_tenure_non_negative CHECK (job_tenure_months IS NULL OR job_tenure_months >= 0);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_financial_app_tenure_non_negative') THEN
    ALTER TABLE financial_data ADD CONSTRAINT chk_financial_app_tenure_non_negative CHECK (application_job_tenure IS NULL OR application_job_tenure >= 0);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_financial_employment_status') THEN
    ALTER TABLE financial_data ADD CONSTRAINT chk_financial_employment_status CHECK (employment_status IN ('employed', 'self_employed', 'unemployed', 'retired'));
  END IF;

  -- Application data constraints
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_application_status') THEN
    ALTER TABLE application_data ADD CONSTRAINT chk_application_status CHECK (status IN ('pending', 'approved', 'rejected', 'in_review', 'completed'));
  END IF;

  -- Test scenarios constraints
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_test_scenario_outcome') THEN
    ALTER TABLE test_scenarios ADD CONSTRAINT chk_test_scenario_outcome CHECK (expected_outcome IN ('success', 'failure', 'success_with_clarification'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_test_scenario_type') THEN
    ALTER TABLE test_scenarios ADD CONSTRAINT chk_test_scenario_type CHECK (scenario_type IN ('standard', 'identity_failure', 'tenure_discrepancy', 'self_employed', 'address_clarification', 'partial_failure'));
  END IF;
END $$;