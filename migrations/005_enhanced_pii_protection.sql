-- Migration: 005_enhanced_pii_protection
-- Description: Enhanced database-level PII protection triggers and stored procedures
-- Author: System
-- Date: 2024-12-22
-- Requirements: 1.3, 7.1, 7.2, 7.3

-- Enhanced PII detection function with more comprehensive regex patterns
CREATE OR REPLACE FUNCTION enforce_conversation_events_pseudonymization()
RETURNS trigger AS $$
BEGIN
  -- Check for SSN patterns (full SSN, last 4 digits, various formats)
  IF NEW.payload::text ~* '(\d{3}-?\d{2}-?\d{4}|\b\d{4}\b(?!\d))' THEN
    RAISE EXCEPTION 'Raw SSN patterns detected in conversation_events payload. All data must be pseudonymized before storage.';
  END IF;
  
  -- Check for DOB patterns (various date formats)
  IF NEW.payload::text ~* '(\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b)' THEN
    RAISE EXCEPTION 'Raw DOB patterns detected in conversation_events payload. All data must be pseudonymized before storage.';
  END IF;
  
  -- Check for email patterns
  IF NEW.payload::text ~* '\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b' THEN
    RAISE EXCEPTION 'Raw email patterns detected in conversation_events payload. All data must be pseudonymized before storage.';
  END IF;
  
  -- Check for address patterns (street addresses with numbers)
  IF NEW.payload::text ~* '\b\d{1,5}\s+[a-zA-Z0-9\s,.-]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|court|ct|place|pl)\b' THEN
    RAISE EXCEPTION 'Raw address patterns detected in conversation_events payload. All data must be pseudonymized before storage.';
  END IF;
  
  -- Check for income patterns (dollar amounts, decimal numbers that could be income)
  IF NEW.payload::text ~* '(\$\d{1,3}(,\d{3})*(\.\d{2})?|\b\d{4,6}(\.\d{2})?\b)' THEN
    RAISE EXCEPTION 'Raw income patterns detected in conversation_events payload. All data must be pseudonymized before storage.';
  END IF;
  
  -- Check for phone number patterns
  IF NEW.payload::text ~* '(\(\d{3}\)\s?\d{3}-?\d{4}|\d{3}-?\d{3}-?\d{4}|\+1\s?\d{3}\s?\d{3}\s?\d{4})' THEN
    RAISE EXCEPTION 'Raw phone number patterns detected in conversation_events payload. All data must be pseudonymized before storage.';
  END IF;
  
  -- Validate required fields
  IF NEW.session_id IS NULL OR NEW.session_id = '' THEN
    RAISE EXCEPTION 'session_id cannot be null or empty';
  END IF;
  
  IF NEW.thread_id IS NULL OR NEW.thread_id = '' THEN
    RAISE EXCEPTION 'thread_id cannot be null or empty';
  END IF;
  
  IF NEW.node IS NULL OR NEW.node = '' THEN
    RAISE EXCEPTION 'node cannot be null or empty';
  END IF;
  
  IF NEW.event_type IS NULL OR NEW.event_type = '' THEN
    RAISE EXCEPTION 'event_type cannot be null or empty';
  END IF;
  
  -- Validate event_type against allowed values
  IF NEW.event_type NOT IN ('session_started', 'message_user', 'message_agent', 'tool_invocation', 'tool_result', 'node_entered', 'node_exited', 'edge_transition', 'state_snapshot_ref', 'error', 'termination') THEN
    RAISE EXCEPTION 'Invalid event_type: %. Must be one of the allowed LangGraph event types.', NEW.event_type;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Enhanced PII detection function for audit_events
CREATE OR REPLACE FUNCTION enforce_audit_events_pseudonymization()
RETURNS trigger AS $$
BEGIN
  -- Check for PII patterns in pseudonymized_summary
  IF NEW.pseudonymized_summary::text ~* '(\d{3}-?\d{2}-?\d{4}|\b\d{4}\b(?!\d)|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b|\$\d{1,3}(,\d{3})*(\.\d{2})?|\(\d{3}\)\s?\d{3}-?\d{4})' THEN
    RAISE EXCEPTION 'Raw PII patterns detected in audit_events pseudonymized_summary. All data must be pseudonymized before storage.';
  END IF;
  
  -- Validate required fields
  IF NEW.session_id IS NULL OR NEW.session_id = '' THEN
    RAISE EXCEPTION 'session_id cannot be null or empty';
  END IF;
  
  IF NEW.event_type IS NULL OR NEW.event_type = '' THEN
    RAISE EXCEPTION 'event_type cannot be null or empty';
  END IF;
  
  IF NEW.operation IS NULL OR NEW.operation = '' THEN
    RAISE EXCEPTION 'operation cannot be null or empty';
  END IF;
  
  IF NEW.outcome IS NULL OR NEW.outcome = '' THEN
    RAISE EXCEPTION 'outcome cannot be null or empty';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for PII detection on audit_events
CREATE TRIGGER trg_audit_events_pii_check
  BEFORE INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION enforce_audit_events_pseudonymization();

-- Stored procedure for field-level encryption using pgcrypto
CREATE OR REPLACE FUNCTION encrypt_sensitive_field(
  plaintext TEXT,
  encryption_key TEXT DEFAULT 'default_encryption_key'
)
RETURNS TEXT AS $$
BEGIN
  -- Use pgcrypto for field-level encryption
  -- In production, the encryption_key should come from environment variables or KMS
  RETURN encode(encrypt(plaintext::bytea, encryption_key, 'aes'), 'base64');
EXCEPTION
  WHEN OTHERS THEN
    -- Fail-closed: return redacted value if encryption fails
    RETURN '[ENCRYPTED_FIELD_ERROR]';
END;
$$ LANGUAGE plpgsql;

-- Stored procedure for field-level decryption
CREATE OR REPLACE FUNCTION decrypt_sensitive_field(
  encrypted_text TEXT,
  encryption_key TEXT DEFAULT 'default_encryption_key'
)
RETURNS TEXT AS $$
BEGIN
  -- Use pgcrypto for field-level decryption
  RETURN convert_from(decrypt(decode(encrypted_text, 'base64'), encryption_key, 'aes'), 'UTF8');
EXCEPTION
  WHEN OTHERS THEN
    -- Fail-closed: return redacted value if decryption fails
    RETURN '[DECRYPTION_ERROR]';
END;
$$ LANGUAGE plpgsql;