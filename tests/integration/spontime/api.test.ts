import { Pool } from 'pg';

describe('Spontime API Integration Tests', () => {
  let pool: Pool;
  
  beforeAll(async () => {
    // Set up database connection
    const databaseUrl = process.env.DATABASE_URL || 'postgresql://dev_user:dev_password@localhost:5432/agents_app_test';
    pool = new Pool({
      connectionString: databaseUrl,
    });

    // Ensure PostGIS extension is enabled
    await pool.query('CREATE EXTENSION IF NOT EXISTS postgis');
  });

  afterAll(async () => {
    // Clean up
    await pool.end();
  });

  describe('Database Schema', () => {
    test('should have spontime_users table', async () => {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'spontime_users'
        );
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    test('should have plans table with PostGIS support', async () => {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'plans'
        );
      `);
      expect(result.rows[0].exists).toBe(true);

      // Check for location_point column
      const columnResult = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'plans' AND column_name = 'location_point';
      `);
      expect(columnResult.rows.length).toBeGreaterThan(0);
    });

    test('should have interest_tags table', async () => {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'interest_tags'
        );
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    test('should have messages table', async () => {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'messages'
        );
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    test('should have plan_members table', async () => {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'plan_members'
        );
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    test('should have default interest tags', async () => {
      const result = await pool.query(`
        SELECT COUNT(*) as count FROM interest_tags;
      `);
      const count = parseInt(result.rows[0].count);
      expect(count).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Geospatial Queries', () => {
    let testUserId: string;
    let testPlanId: string;

    beforeAll(async () => {
      // Create a test user
      const userResult = await pool.query(`
        INSERT INTO spontime_users (username, email, display_name)
        VALUES ('test_geo_user', 'test_geo@example.com', 'Geo Test User')
        RETURNING id;
      `);
      testUserId = userResult.rows[0].id;

      // Create a test plan at San Francisco coordinates
      const planResult = await pool.query(`
        INSERT INTO plans (creator_id, title, description, location_lat, location_lon, location_name, start_time, status)
        VALUES ($1, 'Test Plan SF', 'Test description', 37.7749, -122.4194, 'San Francisco', NOW() + INTERVAL '1 hour', 'active')
        RETURNING id;
      `,
        [testUserId]
      );
      testPlanId = planResult.rows[0].id;
    });

    afterAll(async () => {
      // Clean up test data
      if (testPlanId) {
        await pool.query('DELETE FROM plans WHERE id = $1', [testPlanId]);
      }
      if (testUserId) {
        await pool.query('DELETE FROM spontime_users WHERE id = $1', [testUserId]);
      }
    });

    test('should calculate distance using ST_Distance', async () => {
      // Query plans near San Francisco (within 5 km)
      const result = await pool.query(`
        SELECT 
          id,
          title,
          ST_Distance(
            location_point,
            ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography
          ) as distance_meters
        FROM plans
        WHERE id = $1;
      `, [testPlanId]);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].distance_meters).toBeLessThan(10); // Should be very close (< 10 meters due to same coords)
    });

    test('should filter plans using ST_DWithin', async () => {
      const result = await pool.query(`
        SELECT id, title
        FROM plans
        WHERE ST_DWithin(
          location_point,
          ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography,
          2000
        ) AND id = $1;
      `, [testPlanId]);

      expect(result.rows.length).toBe(1);
    });

    test('should not return plans outside radius', async () => {
      const result = await pool.query(`
        SELECT id, title
        FROM plans
        WHERE ST_DWithin(
          location_point,
          ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography,
          10
        ) AND id = $1;
      `, [testPlanId]);

      expect(result.rows.length).toBe(0);
    });
  });

  describe('Tag Filtering', () => {
    let testUserId: string;
    let testPlanId: string;
    let sportsTagId: string;

    beforeAll(async () => {
      // Create a test user
      const userResult = await pool.query(`
        INSERT INTO spontime_users (username, email, display_name)
        VALUES ('test_tag_user', 'test_tag@example.com', 'Tag Test User')
        RETURNING id;
      `);
      testUserId = userResult.rows[0].id;

      // Get sports tag ID
      const tagResult = await pool.query(`
        SELECT id FROM interest_tags WHERE name = 'Sports' LIMIT 1;
      `);
      sportsTagId = tagResult.rows[0].id;

      // Create a test plan
      const planResult = await pool.query(`
        INSERT INTO plans (creator_id, title, description, location_lat, location_lon, start_time, status)
        VALUES ($1, 'Test Sports Plan', 'Test description', 37.7749, -122.4194, NOW() + INTERVAL '1 hour', 'active')
        RETURNING id;
      `, [testUserId]);
      testPlanId = planResult.rows[0].id;

      // Associate plan with sports tag
      await pool.query(`
        INSERT INTO plan_tags (plan_id, tag_id)
        VALUES ($1, $2);
      `, [testPlanId, sportsTagId]);
    });

    afterAll(async () => {
      // Clean up
      if (testPlanId) {
        await pool.query('DELETE FROM plan_tags WHERE plan_id = $1', [testPlanId]);
        await pool.query('DELETE FROM plans WHERE id = $1', [testPlanId]);
      }
      if (testUserId) {
        await pool.query('DELETE FROM spontime_users WHERE id = $1', [testUserId]);
      }
    });

    test('should filter plans by tag', async () => {
      const result = await pool.query(`
        SELECT p.id, p.title
        FROM plans p
        JOIN plan_tags pt ON p.id = pt.plan_id
        JOIN interest_tags it ON pt.tag_id = it.id
        WHERE it.name = 'Sports' AND p.id = $1;
      `, [testPlanId]);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].title).toBe('Test Sports Plan');
    });

    test('should return plans with multiple tags (OR logic)', async () => {
      const result = await pool.query(`
        SELECT DISTINCT p.id, p.title
        FROM plans p
        JOIN plan_tags pt ON p.id = pt.plan_id
        JOIN interest_tags it ON pt.tag_id = it.id
        WHERE it.name IN ('Sports', 'Food & Drinks') AND p.id = $1;
      `, [testPlanId]);

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Message Access Control', () => {
    let testUser1Id: string;
    let testUser2Id: string;
    let testPlanId: string;

    beforeAll(async () => {
      // Create test users
      const user1Result = await pool.query(`
        INSERT INTO spontime_users (username, email, display_name)
        VALUES ('test_msg_user1', 'test_msg1@example.com', 'Message Test User 1')
        RETURNING id;
      `);
      testUser1Id = user1Result.rows[0].id;

      const user2Result = await pool.query(`
        INSERT INTO spontime_users (username, email, display_name)
        VALUES ('test_msg_user2', 'test_msg2@example.com', 'Message Test User 2')
        RETURNING id;
      `);
      testUser2Id = user2Result.rows[0].id;

      // Create a test plan
      const planResult = await pool.query(`
        INSERT INTO plans (creator_id, title, description, location_lat, location_lon, start_time, status)
        VALUES ($1, 'Test Message Plan', 'Test description', 37.7749, -122.4194, NOW() + INTERVAL '1 hour', 'active')
        RETURNING id;
      `, [testUser1Id]);
      testPlanId = planResult.rows[0].id;

      // Add only user1 as a member
      await pool.query(`
        INSERT INTO plan_members (plan_id, user_id, status)
        VALUES ($1, $2, 'active');
      `, [testPlanId, testUser1Id]);
    });

    afterAll(async () => {
      // Clean up
      if (testPlanId) {
        await pool.query('DELETE FROM messages WHERE plan_id = $1', [testPlanId]);
        await pool.query('DELETE FROM plan_members WHERE plan_id = $1', [testPlanId]);
        await pool.query('DELETE FROM plans WHERE id = $1', [testPlanId]);
      }
      if (testUser1Id) {
        await pool.query('DELETE FROM spontime_users WHERE id = $1', [testUser1Id]);
      }
      if (testUser2Id) {
        await pool.query('DELETE FROM spontime_users WHERE id = $1', [testUser2Id]);
      }
    });

    test('should allow plan members to post messages', async () => {
      const result = await pool.query(`
        INSERT INTO messages (plan_id, user_id, content)
        VALUES ($1, $2, 'Test message from member')
        RETURNING id;
      `, [testPlanId, testUser1Id]);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].id).toBeDefined();
    });

    test('should verify membership before posting', async () => {
      // Check if user2 is a member (should be false)
      const memberCheck = await pool.query(`
        SELECT 1 FROM plan_members
        WHERE plan_id = $1 AND user_id = $2 AND status = 'active';
      `, [testPlanId, testUser2Id]);

      expect(memberCheck.rows.length).toBe(0);
    });

    test('should retrieve messages with user info', async () => {
      // Insert a test message
      await pool.query(`
        INSERT INTO messages (plan_id, user_id, content)
        VALUES ($1, $2, 'Test message for retrieval');
      `, [testPlanId, testUser1Id]);

      const result = await pool.query(`
        SELECT 
          m.id,
          m.content,
          u.username,
          u.display_name
        FROM messages m
        JOIN spontime_users u ON m.user_id = u.id
        WHERE m.plan_id = $1
        ORDER BY m.created_at DESC;
      `, [testPlanId]);

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].username).toBe('test_msg_user1');
    });
  });

  describe('Rate Limiting', () => {
    let testUserId: string;
    let testPlanId: string;

    beforeAll(async () => {
      // Create test user
      const userResult = await pool.query(`
        INSERT INTO spontime_users (username, email, display_name)
        VALUES ('test_rate_user', 'test_rate@example.com', 'Rate Limit Test User')
        RETURNING id;
      `);
      testUserId = userResult.rows[0].id;

      // Create a test plan
      const planResult = await pool.query(`
        INSERT INTO plans (creator_id, title, description, location_lat, location_lon, start_time, status)
        VALUES ($1, 'Test Rate Limit Plan', 'Test description', 37.7749, -122.4194, NOW() + INTERVAL '1 hour', 'active')
        RETURNING id;
      `, [testUserId]);
      testPlanId = planResult.rows[0].id;

      // Add user as member
      await pool.query(`
        INSERT INTO plan_members (plan_id, user_id, status)
        VALUES ($1, $2, 'active');
      `, [testPlanId, testUserId]);
    });

    afterAll(async () => {
      // Clean up
      if (testPlanId) {
        await pool.query('DELETE FROM messages WHERE plan_id = $1', [testPlanId]);
        await pool.query('DELETE FROM plan_members WHERE plan_id = $1', [testPlanId]);
        await pool.query('DELETE FROM plans WHERE id = $1', [testPlanId]);
      }
      if (testUserId) {
        await pool.query('DELETE FROM spontime_users WHERE id = $1', [testUserId]);
      }
    });

    test('should count messages in time window', async () => {
      // Insert 3 test messages
      for (let i = 0; i < 3; i++) {
        await pool.query(`
          INSERT INTO messages (plan_id, user_id, content)
          VALUES ($1, $2, $3);
        `, [testPlanId, testUserId, `Test message ${i + 1}`]);
      }

      // Count messages in last minute
      const windowStart = new Date(Date.now() - 60 * 1000);
      const result = await pool.query(`
        SELECT COUNT(*) as message_count
        FROM messages
        WHERE user_id = $1 AND plan_id = $2 AND created_at >= $3;
      `, [testUserId, testPlanId, windowStart]);

      const count = parseInt(result.rows[0].message_count);
      expect(count).toBe(3);
    });
  });
});
