-- Migration: 006_contact_information_schema
-- Description: Create conversation_sessions table and update contact_information schema for integration tests
-- Author: System
-- Date: 2024-12-22
-- Requirements: Contact Information Node Integration Tests

-- Create conversation_sessions table
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id TEXT PRIMARY KEY,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT chk_session_status CHECK (status IN ('active', 'completed', 'terminated', 'failed'))
);

-- Drop existing contact_information table if it exists (to recreate with proper schema)
DROP TABLE IF EXISTS contact_information;

-- Create contact_information table with proper schema for integration tests
CREATE TABLE IF NOT EXISTS contact_information (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  street_address VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state CHAR(2) NOT NULL,
  zip_code VARCHAR(10) NOT NULL,
  unit_number VARCHAR(50),
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_contact_session 
    FOREIGN KEY (session_id) 
    REFERENCES conversation_sessions(id)
);

-- Create indexes for conversation_sessions
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_status ON conversation_sessions (status);
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_created ON conversation_sessions (created_at);

-- Create indexes for contact_information
CREATE INDEX IF NOT EXISTS idx_contact_session ON contact_information(session_id);
CREATE INDEX IF NOT EXISTS idx_contact_email ON contact_information(email);
CREATE INDEX IF NOT EXISTS idx_contact_state ON contact_information(state);
CREATE INDEX IF NOT EXISTS idx_contact_zip ON contact_information(zip_code);

-- Create verification_attempts table if it doesn't exist (for contact collection tracking)
CREATE TABLE IF NOT EXISTS verification_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id TEXT,
  node TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  reason VARCHAR(40),
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_verification_session 
    FOREIGN KEY (session_id) 
    REFERENCES conversation_sessions(id)
);

-- Create index for verification_attempts
CREATE INDEX IF NOT EXISTS idx_verification_contact ON verification_attempts(session_id, node) 
  WHERE node = 'contact';
CREATE INDEX IF NOT EXISTS idx_verification_attempts_node ON verification_attempts(node);
CREATE INDEX IF NOT EXISTS idx_verification_attempts_success ON verification_attempts(success);