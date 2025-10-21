-- =============================================================================
-- PostgreSQL Initialization Script for Multi-Agent AI Application
-- =============================================================================
-- This script initializes the database schema for agent sessions and memory storage
-- It runs automatically when the PostgreSQL container starts for the first time

-- =============================================================================
-- DATABASE AND USER SETUP
-- =============================================================================

-- Create the main application database (if not already created by POSTGRES_DB)
-- This is handled by the POSTGRES_DB environment variable, but we ensure it exists
SELECT 'CREATE DATABASE ' || :'POSTGRES_DB' 
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'POSTGRES_DB')\gexec

-- Connect to the application database
\c :POSTGRES_DB

-- Create application user (if not already created by POSTGRES_USER)
-- This is handled by the POSTGRES_USER environment variable, but we ensure proper permissions
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = :'POSTGRES_USER') THEN
        EXECUTE format('CREATE USER %I WITH ENCRYPTED PASSWORD %L', :'POSTGRES_USER', :'POSTGRES_PASSWORD');
    END IF;
END
$$;

-- Grant all privileges on the database to the application user
EXECUTE format('GRANT ALL PRIVILEGES ON DATABASE %I TO %I', :'POSTGRES_DB', :'POSTGRES_USER');

-- =============================================================================
-- EXTENSIONS
-- =============================================================================

-- Enable UUID generation extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgcrypto for additional encryption functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- AGENT SESSIONS TABLE
-- =============================================================================

-- Table to store agent session information
CREATE TABLE IF NOT EXISTS agent_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    agent_type VARCHAR(100) NOT NULL,
    agent_name VARCHAR(255),
    user_id VARCHAR(255),
    state JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Indexes for performance
    CONSTRAINT valid_status CHECK (status IN ('active', 'paused', 'completed', 'error', 'expired'))
);

-- Create indexes for agent_sessions
CREATE INDEX IF NOT EXISTS idx_agent_sessions_session_id ON agent_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent_type ON agent_sessions(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_id ON agent_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_created_at ON agent_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_expires_at ON agent_sessions(expires_at);

-- =============================================================================
-- AGENT MEMORY TABLE
-- =============================================================================

-- Table to store agent memory and conversation history
CREATE TABLE IF NOT EXISTS agent_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    memory_type VARCHAR(100) NOT NULL,
    memory_key VARCHAR(255),
    content JSONB NOT NULL,
    content_text TEXT, -- Extracted text for full-text search
    embedding VECTOR(1536), -- For vector similarity search (if using pgvector)
    importance_score FLOAT DEFAULT 0.0,
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Foreign key constraint
    CONSTRAINT fk_agent_memory_session 
        FOREIGN KEY (session_id) 
        REFERENCES agent_sessions(session_id) 
        ON DELETE CASCADE,
    
    -- Check constraints
    CONSTRAINT valid_memory_type CHECK (memory_type IN (
        'conversation', 'system', 'tool_result', 'user_preference', 
        'context', 'summary', 'embedding', 'metadata'
    )),
    CONSTRAINT valid_importance_score CHECK (importance_score >= 0.0 AND importance_score <= 1.0)
);

-- Create indexes for agent_memory
CREATE INDEX IF NOT EXISTS idx_agent_memory_session_id ON agent_memory(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_type ON agent_memory(memory_type);
CREATE INDEX IF NOT EXISTS idx_agent_memory_key ON agent_memory(memory_key);
CREATE INDEX IF NOT EXISTS idx_agent_memory_created_at ON agent_memory(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_memory_importance ON agent_memory(importance_score DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_access_count ON agent_memory(access_count DESC);

-- Full-text search index on content_text
CREATE INDEX IF NOT EXISTS idx_agent_memory_content_text ON agent_memory USING gin(to_tsvector('english', content_text));

-- Vector similarity search index on embeddings (using HNSW for better performance)
CREATE INDEX IF NOT EXISTS idx_agent_memory_embedding ON agent_memory USING hnsw (embedding vector_cosine_ops);

-- =============================================================================
-- AGENT TOOLS TABLE
-- =============================================================================

-- Table to store agent tool usage and results
CREATE TABLE IF NOT EXISTS agent_tools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    tool_name VARCHAR(255) NOT NULL,
    tool_input JSONB,
    tool_output JSONB,
    execution_time_ms INTEGER,
    status VARCHAR(50) DEFAULT 'success',
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraint
    CONSTRAINT fk_agent_tools_session 
        FOREIGN KEY (session_id) 
        REFERENCES agent_sessions(session_id) 
        ON DELETE CASCADE,
    
    -- Check constraints
    CONSTRAINT valid_tool_status CHECK (status IN ('success', 'error', 'timeout', 'cancelled'))
);

-- Create indexes for agent_tools
CREATE INDEX IF NOT EXISTS idx_agent_tools_session_id ON agent_tools(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_tools_name ON agent_tools(tool_name);
CREATE INDEX IF NOT EXISTS idx_agent_tools_status ON agent_tools(status);
CREATE INDEX IF NOT EXISTS idx_agent_tools_created_at ON agent_tools(created_at);

-- =============================================================================
-- DOCUMENT STORAGE TABLE (for research agents)
-- =============================================================================

-- Table to store documents and their metadata for research agents
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500),
    content TEXT NOT NULL,
    content_type VARCHAR(100) DEFAULT 'text/plain',
    source_url VARCHAR(1000),
    source_type VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    embedding VECTOR(1536), -- For vector similarity search
    chunk_index INTEGER DEFAULT 0,
    parent_document_id VARCHAR(255),
    indexed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for documents
CREATE INDEX IF NOT EXISTS idx_documents_document_id ON documents(document_id);
CREATE INDEX IF NOT EXISTS idx_documents_source_type ON documents(source_type);
CREATE INDEX IF NOT EXISTS idx_documents_parent_id ON documents(parent_document_id);
CREATE INDEX IF NOT EXISTS idx_documents_chunk_index ON documents(chunk_index);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);

-- Full-text search index on content
CREATE INDEX IF NOT EXISTS idx_documents_content_text ON documents USING gin(to_tsvector('english', content));

-- Vector similarity search index on document embeddings (using HNSW for better performance)
CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents USING hnsw (embedding vector_cosine_ops);

-- =============================================================================
-- FUNCTIONS AND TRIGGERS
-- =============================================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at for agent_sessions
CREATE TRIGGER update_agent_sessions_updated_at 
    BEFORE UPDATE ON agent_sessions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger to automatically update updated_at for documents
CREATE TRIGGER update_documents_updated_at 
    BEFORE UPDATE ON documents 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM agent_sessions 
    WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- PERMISSIONS
-- =============================================================================

-- Grant permissions to the application user
EXECUTE format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO %I', :'POSTGRES_USER');
EXECUTE format('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO %I', :'POSTGRES_USER');
EXECUTE format('GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO %I', :'POSTGRES_USER');

-- Grant permissions for future tables
EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO %I', :'POSTGRES_USER');
EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO %I', :'POSTGRES_USER');
EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO %I', :'POSTGRES_USER');

-- =============================================================================
-- SAMPLE DATA (for development)
-- =============================================================================

-- Insert sample data only in development environment
DO $$
BEGIN
    -- Check if this is a development database (contains 'dev' in the name)
    IF CURRENT_DATABASE() LIKE '%dev%' THEN
        -- Insert sample agent session
        INSERT INTO agent_sessions (session_id, agent_type, agent_name, user_id, state, status)
        VALUES (
            'sample-session-001',
            'react-agent',
            'Development React Agent',
            'dev-user-001',
            '{"initialized": true, "step_count": 0}',
            'active'
        ) ON CONFLICT (session_id) DO NOTHING;
        
        -- Insert sample memory entries
        INSERT INTO agent_memory (session_id, memory_type, memory_key, content, content_text)
        VALUES 
        (
            'sample-session-001',
            'system',
            'initialization',
            '{"message": "Agent initialized successfully", "timestamp": "2024-01-01T00:00:00Z"}',
            'Agent initialized successfully'
        ),
        (
            'sample-session-001',
            'conversation',
            'greeting',
            '{"user": "Hello", "assistant": "Hello! How can I help you today?"}',
            'Hello How can I help you today?'
        ) ON CONFLICT DO NOTHING;
        
        RAISE NOTICE 'Sample development data inserted successfully';
    END IF;
END
$$;

-- =============================================================================
-- COMPLETION MESSAGE
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'PostgreSQL initialization completed successfully';
    RAISE NOTICE 'Database: %', CURRENT_DATABASE();
    RAISE NOTICE 'Schema version: 1.0.0';
    RAISE NOTICE 'Tables created: agent_sessions, agent_memory, agent_tools, documents';
END
$$;