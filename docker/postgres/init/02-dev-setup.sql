-- =============================================================================
-- Development-Specific PostgreSQL Setup
-- =============================================================================
-- This script runs additional setup for development environments only
-- It includes additional logging, debugging features, and development utilities

-- Only run in development databases
DO $$
BEGIN
    IF CURRENT_DATABASE() LIKE '%dev%' THEN
        -- Enable additional logging for development
        ALTER SYSTEM SET log_statement = 'all';
        ALTER SYSTEM SET log_duration = 'on';
        ALTER SYSTEM SET log_min_duration_statement = 0;
        
        -- Create development utility functions
        
        -- Function to reset all agent sessions (development only)
        CREATE OR REPLACE FUNCTION dev_reset_sessions()
        RETURNS VOID AS $func$
        BEGIN
            TRUNCATE TABLE agent_memory CASCADE;
            TRUNCATE TABLE agent_tools CASCADE;
            TRUNCATE TABLE agent_sessions CASCADE;
            RAISE NOTICE 'All agent sessions and related data have been reset';
        END;
        $func$ LANGUAGE plpgsql;
        
        -- Function to get session statistics
        CREATE OR REPLACE FUNCTION dev_session_stats()
        RETURNS TABLE(
            total_sessions BIGINT,
            active_sessions BIGINT,
            total_memories BIGINT,
            total_tools BIGINT,
            avg_memories_per_session NUMERIC
        ) AS $func$
        BEGIN
            RETURN QUERY
            SELECT 
                (SELECT COUNT(*) FROM agent_sessions),
                (SELECT COUNT(*) FROM agent_sessions WHERE status = 'active'),
                (SELECT COUNT(*) FROM agent_memory),
                (SELECT COUNT(*) FROM agent_tools),
                (SELECT ROUND(AVG(memory_count), 2) FROM (
                    SELECT COUNT(*) as memory_count 
                    FROM agent_memory 
                    GROUP BY session_id
                ) subq);
        END;
        $func$ LANGUAGE plpgsql;
        
        -- Function to simulate agent activity (for testing)
        CREATE OR REPLACE FUNCTION dev_create_test_session(
            p_agent_type VARCHAR DEFAULT 'test-agent',
            p_memory_count INTEGER DEFAULT 5
        )
        RETURNS VARCHAR AS $func$
        DECLARE
            v_session_id VARCHAR;
            i INTEGER;
        BEGIN
            -- Generate unique session ID
            v_session_id := 'test-session-' || extract(epoch from now())::bigint;
            
            -- Create test session
            INSERT INTO agent_sessions (session_id, agent_type, agent_name, user_id, state)
            VALUES (
                v_session_id,
                p_agent_type,
                'Test ' || p_agent_type,
                'test-user',
                '{"test": true, "created_by": "dev_function"}'
            );
            
            -- Create test memories
            FOR i IN 1..p_memory_count LOOP
                INSERT INTO agent_memory (session_id, memory_type, memory_key, content, content_text)
                VALUES (
                    v_session_id,
                    CASE (i % 3)
                        WHEN 0 THEN 'conversation'
                        WHEN 1 THEN 'system'
                        ELSE 'context'
                    END,
                    'test-memory-' || i,
                    format('{"test_memory": %s, "content": "Test memory content %s"}', i, i),
                    'Test memory content ' || i
                );
            END LOOP;
            
            RAISE NOTICE 'Created test session: % with % memories', v_session_id, p_memory_count;
            RETURN v_session_id;
        END;
        $func$ LANGUAGE plpgsql;
        
        -- Grant permissions on development functions
        EXECUTE format('GRANT EXECUTE ON FUNCTION dev_reset_sessions() TO %I', :'POSTGRES_USER');
        EXECUTE format('GRANT EXECUTE ON FUNCTION dev_session_stats() TO %I', :'POSTGRES_USER');
        EXECUTE format('GRANT EXECUTE ON FUNCTION dev_create_test_session(VARCHAR, INTEGER) TO %I', :'POSTGRES_USER');
        
        RAISE NOTICE 'Development utilities installed successfully';
        RAISE NOTICE 'Available functions: dev_reset_sessions(), dev_session_stats(), dev_create_test_session()';
    ELSE
        RAISE NOTICE 'Skipping development setup for production database';
    END IF;
END
$$;