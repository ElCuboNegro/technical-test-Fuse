-- Migration: 003_missing_database_tables
-- Description: Create missing database tables for voice verification system
-- Author: System
-- Date: 2024-12-22
-- Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8

-- Create identity_records table (if not exists from previous migrations)
CREATE TABLE IF NOT EXISTS identity_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref TEXT UNIQUE,
  dob_hash TEXT NOT NULL,
  ssn4_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create contact_information table
CREATE TABLE IF NOT EXISTS contact_information (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  address_hash TEXT,
  email_hash TEXT,
  phone_hash TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create financial_data table
CREATE TABLE IF NOT EXISTS financial_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  monthly_income_hash TEXT,
  job_tenure_months INTEGER,
  employment_status TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create application_data table
CREATE TABLE IF NOT EXISTS application_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  verification_attempts INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT chk_application_status CHECK (status IN ('pending', 'verified', 'failed', 'terminated'))
);

-- Create test_scenarios table
CREATE TABLE IF NOT EXISTS test_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_name TEXT UNIQUE NOT NULL,
  scenario_type TEXT NOT NULL,
  test_data JSONB NOT NULL DEFAULT '{}',
  expected_outcome TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT chk_scenario_type CHECK (scenario_type IN ('identity_success', 'identity_failure', 'contact_collection', 'financial_verification', 'discrepancy_handling'))
);

-- Create indexes for identity_records (if not already created)
CREATE INDEX IF NOT EXISTS idx_identity_records_ref ON identity_records (external_ref);
CREATE INDEX IF NOT EXISTS idx_identity_records_combo ON identity_records (dob_hash, ssn4_hash);

-- Create indexes for contact_information
CREATE INDEX IF NOT EXISTS idx_contact_information_user ON contact_information (user_id);
CREATE INDEX IF NOT EXISTS idx_contact_information_email ON contact_information (email_hash);

-- Create indexes for financial_data
CREATE INDEX IF NOT EXISTS idx_financial_data_user ON financial_data (user_id);
CREATE INDEX IF NOT EXISTS idx_financial_data_tenure ON financial_data (job_tenure_months);

-- Create indexes for application_data
CREATE INDEX IF NOT EXISTS idx_application_data_app_id ON application_data (application_id);
CREATE INDEX IF NOT EXISTS idx_application_data_user ON application_data (user_id);
CREATE INDEX IF NOT EXISTS idx_application_data_status ON application_data (status);
CREATE INDEX IF NOT EXISTS idx_application_data_attempts ON application_data (verification_attempts);

-- Create indexes for test_scenarios
CREATE INDEX IF NOT EXISTS idx_test_scenarios_name ON test_scenarios (scenario_name);
CREATE INDEX IF NOT EXISTS idx_test_scenarios_type ON test_scenarios (scenario_type);