const { Pool } = require('pg');
require('dotenv').config();

async function testPIIEnforcement() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('Testing PII enforcement triggers...');

    // Test 1: Valid pseudonymized data should work
    console.log('\n1. Testing valid pseudonymized data insertion...');
    try {
      await pool.query(`
        INSERT INTO conversation_events (
          session_id, thread_id, user_id, node, event_type, payload
        ) VALUES (
          'session_123', 'thread_456', 'user_789', 'identity', 'session_started',
          '{"status": "started", "pseudonymized_user": "user_abc123"}'
        )
      `);
      console.log('✓ Valid pseudonymized data inserted successfully');
    } catch (error) {
      console.log('✗ Valid data insertion failed:', error.message);
    }

    // Test 2: Raw SSN should be blocked
    console.log('\n2. Testing raw SSN detection...');
    try {
      await pool.query(`
        INSERT INTO conversation_events (
          session_id, thread_id, user_id, node, event_type, payload
        ) VALUES (
          'session_124', 'thread_457', 'user_790', 'identity', 'message_user',
          '{"ssn": "123-45-6789", "status": "collecting"}'
        )
      `);
      console.log('✗ Raw SSN was NOT blocked (this should not happen)');
    } catch (error) {
      console.log('✓ Raw SSN correctly blocked:', error.message);
    }

    // Test 3: Raw email should be blocked
    console.log('\n3. Testing raw email detection...');
    try {
      await pool.query(`
        INSERT INTO conversation_events (
          session_id, thread_id, user_id, node, event_type, payload
        ) VALUES (
          'session_125', 'thread_458', 'user_791', 'contact', 'message_user',
          '{"email": "john.doe@example.com", "status": "collecting"}'
        )
      `);
      console.log('✗ Raw email was NOT blocked (this should not happen)');
    } catch (error) {
      console.log('✓ Raw email correctly blocked:', error.message);
    }

    // Test 4: Raw date of birth should be blocked
    console.log('\n4. Testing raw date of birth detection...');
    try {
      await pool.query(`
        INSERT INTO conversation_events (
          session_id, thread_id, user_id, node, event_type, payload
        ) VALUES (
          'session_126', 'thread_459', 'user_792', 'identity', 'message_user',
          '{"dob": "03/15/1985", "status": "collecting"}'
        )
      `);
      console.log('✗ Raw DOB was NOT blocked (this should not happen)');
    } catch (error) {
      console.log('✓ Raw DOB correctly blocked:', error.message);
    }

    // Test 5: Invalid event type should be blocked
    console.log('\n5. Testing invalid event type...');
    try {
      await pool.query(`
        INSERT INTO conversation_events (
          session_id, thread_id, user_id, node, event_type, payload
        ) VALUES (
          'session_127', 'thread_460', 'user_793', 'identity', 'invalid_event_type',
          '{"status": "test"}'
        )
      `);
      console.log('✗ Invalid event type was NOT blocked (this should not happen)');
    } catch (error) {
      console.log('✓ Invalid event type correctly blocked:', error.message);
    }

    // Test 6: Test audit events immutability
    console.log('\n6. Testing audit events immutability...');
    
    // First insert an audit event
    const insertResult = await pool.query(`
      INSERT INTO audit_events (
        session_id, user_id, event_type, actor, operation, outcome, pseudonymized_summary
      ) VALUES (
        'session_audit_123', 'user_audit_456', 'identity_verification', 'system', 'verify_identity', 'success',
        '{"verification_result": "passed", "attempts": 1}'
      ) RETURNING id
    `);
    
    const auditId = insertResult.rows[0].id;
    console.log('✓ Audit event inserted successfully');

    // Try to update it (should fail)
    try {
      await pool.query(`
        UPDATE audit_events SET outcome = 'failure' WHERE id = $1
      `, [auditId]);
      console.log('✗ Audit event UPDATE was NOT blocked (this should not happen)');
    } catch (error) {
      console.log('✓ Audit event UPDATE correctly blocked:', error.message);
    }

    // Try to delete it (should fail)
    try {
      await pool.query(`
        DELETE FROM audit_events WHERE id = $1
      `, [auditId]);
      console.log('✗ Audit event DELETE was NOT blocked (this should not happen)');
    } catch (error) {
      console.log('✓ Audit event DELETE correctly blocked:', error.message);
    }

    // Test 7: Test pseudonym cache validation
    console.log('\n7. Testing pseudonym cache validation...');
    try {
      await pool.query(`
        INSERT INTO pseudonym_cache (
          original_hash, pseudonym, data_type
        ) VALUES (
          'hash_abc123', 'pseudo_xyz789', 'ssn'
        )
      `);
      console.log('✓ Valid pseudonym cache entry inserted successfully');
    } catch (error) {
      console.log('✗ Valid pseudonym cache insertion failed:', error.message);
    }

    // Clean up test data
    console.log('\n8. Cleaning up test data...');
    await pool.query(`DELETE FROM conversation_events WHERE session_id LIKE 'session_12%'`);
    await pool.query(`DELETE FROM pseudonym_cache WHERE original_hash = 'hash_abc123'`);
    console.log('✓ Test data cleaned up');

    console.log('\n✓ PII enforcement testing completed successfully');

  } catch (error) {
    console.error('Error testing PII enforcement:', error);
  } finally {
    await pool.end();
  }
}

testPIIEnforcement();