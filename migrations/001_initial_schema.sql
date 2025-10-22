-- Migration: 001_initial_schema
-- Description: Create initial identity_records table and schema_migrations tracking table
-- Author: System
-- Date: 2024-01-01

-- Create schema_migrations table first (for tracking applied migrations)
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  applied_at TIMESTAMP DEFAULT NOW(),
  execution_time_ms INTEGER,
  success BOOLEAN DEFAULT TRUE
);

-- Create identity_records table
CREATE TABLE IF NOT EXISTS identity_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  dob DATE NOT NULL,
  dob_hash TEXT NOT NULL,
  ssn4_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for identity_records
CREATE INDEX IF NOT EXISTS idx_identity_records_ref ON identity_records (external_ref);
CREATE INDEX IF NOT EXISTS idx_identity_records_combo ON identity_records (dob_hash, ssn4_hash);
CREATE INDEX IF NOT EXISTS idx_identity_records_dob ON identity_records (dob);