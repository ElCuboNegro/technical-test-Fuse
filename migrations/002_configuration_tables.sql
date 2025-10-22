-- Migration: 002_configuration_tables
-- Description: Create system configuration tables for database seeding system
-- Author: System
-- Date: 2024-12-21
-- Requirements: 6.1, 6.2, 6.3, 6.5

-- Create system_variables table for storing configuration values
CREATE TABLE IF NOT EXISTS system_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variable_name TEXT UNIQUE NOT NULL,
  variable_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create response_templates table for storing reusable response templates
CREATE TABLE IF NOT EXISTS response_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT UNIQUE NOT NULL,
  template_content TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for system_variables
CREATE INDEX IF NOT EXISTS idx_system_variables_name ON system_variables (variable_name);

-- Create indexes for response_templates  
CREATE INDEX IF NOT EXISTS idx_response_templates_name ON response_templates (template_name);

-- Insert default system variables for database configuration
INSERT INTO system_variables (variable_name, variable_value, description) VALUES
  ('job_tenure_threshold_months', '15', 'Minimum job tenure in months for verification'),
  ('identity_verification_max_attempts', '2', 'Maximum attempts allowed for identity verification'),
  ('database_environment_indicators', '["_test", "test_", "testing", ":5433"]', 'Indicators that suggest a test database environment')
ON CONFLICT (variable_name) DO UPDATE SET
  variable_value = EXCLUDED.variable_value,
  updated_at = NOW();

-- Insert default response templates for professional communication
INSERT INTO response_templates (template_name, template_content, description) VALUES
  ('identity_verification_failure', 'I understand this can be frustrating. However, the last four digits of your Social Security Number and date of birth are required to proceed with the verification. Since we''re unable to verify this information today, I''ll need to conclude our call. Thank you for your time, and please feel free to call back when you have this information available.', 'Professional termination script for identity verification failures'),
  ('job_tenure_discrepancy', 'I show on your application that you''ve been employed for {application_months} months. Can you help me understand the difference between what you''re telling me now - {stated_months} months - and what''s shown on the application?', 'Script for addressing job tenure discrepancies'),
  ('database_connection_success', 'Database connection established successfully to {environment} environment', 'Success message for database connections'),
  ('environment_validation_warning', 'Warning: {environment} environment using {database_type} database URL', 'Warning message for environment validation')
ON CONFLICT (template_name) DO UPDATE SET
  template_content = EXCLUDED.template_content,
  updated_at = NOW();