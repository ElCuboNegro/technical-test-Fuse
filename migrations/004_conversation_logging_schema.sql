-- Migration: 004_conversation_logging_schema
-- Description: Create conversation logging and pseudonymization database schema
-- Author: System
-- Date: 2024-12-22
-- Requirements: 4.1, 4.2, 7.1, 7.2

-- Create conversation_events table for unified event logging
CREATE TABLE IF NOT EXISTS conversation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  user_id TEXT,
  node TEXT NOT NULL,
  event_type TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  step_index INTEGER,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Unique constraint to prevent duplicate events
  CONSTRAINT uq_conversation_events_unique UNIQUE (session_id, thread_id, step_index, event_type)
);

-- Create audit_events table for immutable compliance audit trail
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id TEXT,
  event_type TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  actor TEXT,
  operation TEXT NOT NULL,
  resource TEXT,
  outcome TEXT NOT NULL,
  pseudonymized_summary JSONB NOT NULL DEFAULT '{}',
  retention_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Check constraint for valid outcomes
  CONSTRAINT chk_audit_outcome CHECK (outcome IN ('success', 'failure', 'error', 'warning'))
);

-- Create graph_nodes table for visualization (PII-safe)
CREATE TABLE IF NOT EXISTS graph_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  node_name TEXT NOT NULL,
  node_type TEXT NOT NULL,
  entry_timestamp TIMESTAMP,
  exit_timestamp TIMESTAMP,
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Check constraint for valid status values
  CONSTRAINT chk_graph_node_status CHECK (status IN ('pending', 'active', 'completed', 'failed', 'skipped'))
);

-- Create graph_edges table for visualization (PII-safe)
CREATE TABLE IF NOT EXISTS graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  from_node TEXT NOT NULL,
  to_node TEXT NOT NULL,
  transition_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  condition_met TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create pseudonym_cache table with TTL enforcement
CREATE TABLE IF NOT EXISTS pseudonym_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_hash TEXT NOT NULL UNIQUE,
  pseudonym TEXT NOT NULL UNIQUE,
  data_type TEXT NOT NULL,
  salt_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  
  -- Check constraint for valid data types
  CONSTRAINT chk_pseudonym_data_type CHECK (data_type IN ('ssn', 'dob', 'email', 'address', 'income', 'name', 'phone'))
);

-- Create indexes for conversation_events
CREATE INDEX IF NOT EXISTS idx_conversation_events_session ON conversation_events (session_id);
CREATE INDEX IF NOT EXISTS idx_conversation_events_thread ON conversation_events (thread_id);
CREATE INDEX IF NOT EXISTS idx_conversation_events_user ON conversation_events (user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_events_node ON conversation_events (node);
CREATE INDEX IF NOT EXISTS idx_conversation_events_type ON conversation_events (event_type);
CREATE INDEX IF NOT EXISTS idx_conversation_events_timestamp ON conversation_events (timestamp);
CREATE INDEX IF NOT EXISTS idx_conversation_events_step ON conversation_events (step_index);

-- Create indexes for audit_events
CREATE INDEX IF NOT EXISTS idx_audit_events_session ON audit_events (session_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_type ON audit_events (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events (timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events (actor);
CREATE INDEX IF NOT EXISTS idx_audit_events_operation ON audit_events (operation);
CREATE INDEX IF NOT EXISTS idx_audit_events_outcome ON audit_events (outcome);
CREATE INDEX IF NOT EXISTS idx_audit_events_retention ON audit_events (retention_until);

-- Create indexes for graph_nodes
CREATE INDEX IF NOT EXISTS idx_graph_nodes_session ON graph_nodes (session_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_name ON graph_nodes (node_name);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes (node_type);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_entry ON graph_nodes (entry_timestamp);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_status ON graph_nodes (status);

-- Create indexes for graph_edges
CREATE INDEX IF NOT EXISTS idx_graph_edges_session ON graph_edges (session_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_from ON graph_edges (from_node);
CREATE INDEX IF NOT EXISTS idx_graph_edges_to ON graph_edges (to_node);
CREATE INDEX IF NOT EXISTS idx_graph_edges_timestamp ON graph_edges (transition_timestamp);

-- Create indexes for pseudonym_cache
CREATE INDEX IF NOT EXISTS idx_pseudonym_cache_hash ON pseudonym_cache (original_hash);
CREATE INDEX IF NOT EXISTS idx_pseudonym_cache_pseudonym ON pseudonym_cache (pseudonym);
CREATE INDEX IF NOT EXISTS idx_pseudonym_cache_type ON pseudonym_cache (data_type);
CREATE INDEX IF NOT EXISTS idx_pseudonym_cache_expires ON pseudonym_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_pseudonym_cache_salt ON pseudonym_cache (salt_version);

-- Create PII detection function for conversation_events
CREATE OR REPLACE FUNCTION enforce_conversation_events_pseudonymization()
RETURNS trigger AS $$
BEGIN
  -- Check for common PII patterns in payload
  IF NEW.payload::text ~* '(\d{3}-?\d{2}-?\d{4}|\d{4}|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|\b\d{1,5}\s+[a-zA-Z0-9\s,.-]+\b|\$\d+|\d+\.\d{2})' THEN
    RAISE EXCEPTION 'Raw PII patterns detected in conversation_events payload. All data must be pseudonymized before storage.';
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

-- Create trigger for PII detection on conversation_events
CREATE TRIGGER trg_conversation_events_pii_check
  BEFORE INSERT OR UPDATE ON conversation_events
  FOR EACH ROW EXECUTE FUNCTION enforce_conversation_events_pseudonymization();

-- Create function to prevent audit_events modification (immutability)
CREATE OR REPLACE FUNCTION prevent_audit_events_modification()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'UPDATE operations are not allowed on audit_events table. Audit records must be immutable.';
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DELETE operations are not allowed on audit_events table. Audit records must be immutable.';
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to enforce audit_events immutability
CREATE TRIGGER trg_audit_events_prevent_update
  BEFORE UPDATE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_events_modification();

CREATE TRIGGER trg_audit_events_prevent_delete
  BEFORE DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_events_modification();

-- Create function for pseudonym_cache TTL cleanup
CREATE OR REPLACE FUNCTION cleanup_expired_pseudonyms()
RETURNS void AS $$
BEGIN
  DELETE FROM pseudonym_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Create function to validate pseudonym_cache entries
CREATE OR REPLACE FUNCTION validate_pseudonym_cache_entry()
RETURNS trigger AS $$
BEGIN
  -- Ensure expires_at is set and in the future
  IF NEW.expires_at IS NULL OR NEW.expires_at <= NOW() THEN
    NEW.expires_at := NOW() + INTERVAL '24 hours';
  END IF;
  
  -- Validate salt_version is positive
  IF NEW.salt_version IS NULL OR NEW.salt_version < 1 THEN
    NEW.salt_version := 1;
  END IF;
  
  -- Validate required fields
  IF NEW.original_hash IS NULL OR NEW.original_hash = '' THEN
    RAISE EXCEPTION 'original_hash cannot be null or empty';
  END IF;
  
  IF NEW.pseudonym IS NULL OR NEW.pseudonym = '' THEN
    RAISE EXCEPTION 'pseudonym cannot be null or empty';
  END IF;
  
  IF NEW.data_type IS NULL OR NEW.data_type = '' THEN
    RAISE EXCEPTION 'data_type cannot be null or empty';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for pseudonym_cache validation
CREATE TRIGGER trg_pseudonym_cache_validate
  BEFORE INSERT OR UPDATE ON pseudonym_cache
  FOR EACH ROW EXECUTE FUNCTION validate_pseudonym_cache_entry();

-- Create view for analytics-safe conversation data
CREATE OR REPLACE VIEW conversation_analytics AS
SELECT 
  ce.id,
  ce.session_id,
  ce.thread_id,
  ce.node,
  ce.event_type,
  ce.timestamp,
  ce.step_index,
  -- Only expose safe metadata, never raw payload
  CASE 
    WHEN ce.payload ? 'event_count' THEN jsonb_build_object('event_count', ce.payload->'event_count')
    WHEN ce.payload ? 'duration_ms' THEN jsonb_build_object('duration_ms', ce.payload->'duration_ms')
    WHEN ce.payload ? 'status' THEN jsonb_build_object('status', ce.payload->'status')
    ELSE '{}'::jsonb
  END as safe_metadata,
  ce.created_at
FROM conversation_events ce;

-- Create view for audit trail queries (compliance-safe)
CREATE OR REPLACE VIEW audit_trail AS
SELECT 
  ae.id,
  ae.session_id,
  ae.event_type,
  ae.timestamp,
  ae.actor,
  ae.operation,
  ae.resource,
  ae.outcome,
  -- Only expose pseudonymized summary, never raw data
  ae.pseudonymized_summary,
  ae.retention_until,
  ae.created_at
FROM audit_events ae
WHERE ae.retention_until IS NULL OR ae.retention_until > NOW();

-- Create view for graph visualization (PII-safe)
CREATE OR REPLACE VIEW conversation_graph AS
SELECT 
  gn.session_id,
  gn.node_name,
  gn.node_type,
  gn.entry_timestamp,
  gn.exit_timestamp,
  gn.duration_ms,
  gn.status,
  -- Safe metadata only
  CASE 
    WHEN gn.metadata ? 'attempt_count' THEN jsonb_build_object('attempt_count', gn.metadata->'attempt_count')
    WHEN gn.metadata ? 'success_rate' THEN jsonb_build_object('success_rate', gn.metadata->'success_rate')
    ELSE '{}'::jsonb
  END as safe_metadata,
  array_agg(
    jsonb_build_object(
      'to_node', ge.to_node,
      'timestamp', ge.transition_timestamp,
      'condition', ge.condition_met
    ) ORDER BY ge.transition_timestamp
  ) as transitions
FROM graph_nodes gn
LEFT JOIN graph_edges ge ON gn.session_id = ge.session_id AND gn.node_name = ge.from_node
GROUP BY gn.session_id, gn.node_name, gn.node_type, gn.entry_timestamp, gn.exit_timestamp, gn.duration_ms, gn.status, gn.metadata;

-- Grant appropriate permissions (read-only for analytics roles)
-- Note: These would be customized based on actual role structure
-- GRANT SELECT ON conversation_analytics TO analytics_role;
-- GRANT SELECT ON audit_trail TO compliance_role;
-- GRANT SELECT ON conversation_graph TO visualization_role;

-- Create stored procedure for safe data cleanup based on retention policies
CREATE OR REPLACE FUNCTION cleanup_conversation_data(
  events_retention_days INTEGER DEFAULT 90,
  audit_retention_days INTEGER DEFAULT 365
)
RETURNS TABLE(
  events_deleted INTEGER,
  pseudonyms_deleted INTEGER,
  graph_nodes_deleted INTEGER,
  graph_edges_deleted INTEGER
) AS $$
DECLARE
  events_count INTEGER := 0;
  pseudonyms_count INTEGER := 0;
  nodes_count INTEGER := 0;
  edges_count INTEGER := 0;
BEGIN
  -- Clean up expired conversation events
  DELETE FROM conversation_events 
  WHERE created_at < NOW() - (events_retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS events_count = ROW_COUNT;
  
  -- Clean up expired pseudonym cache entries
  DELETE FROM pseudonym_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS pseudonyms_count = ROW_COUNT;
  
  -- Clean up orphaned graph nodes
  DELETE FROM graph_nodes 
  WHERE created_at < NOW() - (events_retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS nodes_count = ROW_COUNT;
  
  -- Clean up orphaned graph edges
  DELETE FROM graph_edges 
  WHERE created_at < NOW() - (events_retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS edges_count = ROW_COUNT;
  
  -- Note: audit_events are never automatically deleted due to compliance requirements
  -- They would require manual intervention with proper authorization
  
  RETURN QUERY SELECT events_count, pseudonyms_count, nodes_count, edges_count;
END;
$$ LANGUAGE plpgsql;