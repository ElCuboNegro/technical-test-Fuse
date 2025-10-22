-- Migration: 007_contact_performance_indexes
-- Description: Add additional performance indexes for contact information queries
-- Author: System
-- Date: 2024-12-22
-- Requirements: R6.1 - Database indexes for performance optimization

-- Additional indexes for contact information performance optimization
CREATE INDEX IF NOT EXISTS idx_contact_state_zip ON contact_information(state, zip_code);
CREATE INDEX IF NOT EXISTS idx_contact_created_at ON contact_information(created_at);
CREATE INDEX IF NOT EXISTS idx_contact_updated_at ON contact_information(updated_at);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_contact_session_created ON contact_information(session_id, created_at DESC);

-- Index for email queries (partial index to save space)
CREATE INDEX IF NOT EXISTS idx_contact_email_not_null ON contact_information(email) 
  WHERE email IS NOT NULL;

-- Index for unit number queries (partial index)
CREATE INDEX IF NOT EXISTS idx_contact_unit_not_null ON contact_information(unit_number) 
  WHERE unit_number IS NOT NULL;

-- Additional indexes for verification_attempts table for contact node
CREATE INDEX IF NOT EXISTS idx_verification_session_node_attempt ON verification_attempts(session_id, node, attempt_number)
  WHERE node = 'contact';

CREATE INDEX IF NOT EXISTS idx_verification_created_at ON verification_attempts(created_at);

-- Index for conversation_sessions performance
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_updated ON conversation_sessions(updated_at);

-- Analyze tables to update statistics after index creation
ANALYZE contact_information;
ANALYZE verification_attempts;
ANALYZE conversation_sessions;