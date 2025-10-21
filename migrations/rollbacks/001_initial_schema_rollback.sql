-- Rollback for Migration: 001_initial_schema
-- Description: Drop identity_records table and related indexes
-- Author: System
-- Date: 2024-01-01

-- Drop indexes first
DROP INDEX IF EXISTS idx_identity_records_dob;
DROP INDEX IF EXISTS idx_identity_records_combo;
DROP INDEX IF EXISTS idx_identity_records_ref;

-- Drop identity_records table
DROP TABLE IF EXISTS identity_records;

-- Note: schema_migrations table is not dropped as it's needed for migration tracking