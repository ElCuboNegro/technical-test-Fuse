const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkConversationTables() {
  const client = await pool.connect();
  try {
    console.log("=== Conversation Logging Tables ===");

    // Check conversation logging tables
    const tables = [
      "conversation_events",
      "audit_events",
      "graph_nodes",
      "graph_edges",
      "pseudonym_cache",
    ];

    for (const table of tables) {
      const result = await client.query(
        `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )
      `,
        [table],
      );

      console.log(
        `✓ ${table}: ${result.rows[0].exists ? "EXISTS" : "MISSING"}`,
      );
    }

    // Check triggers
    const triggers = await client.query(`
      SELECT trigger_name, event_object_table 
      FROM information_schema.triggers 
      WHERE trigger_schema = 'public'
      AND event_object_table IN ('conversation_events', 'audit_events', 'pseudonym_cache')
    `);

    console.log("\n=== Triggers ===");
    triggers.rows.forEach((row) => {
      console.log(`✓ ${row.trigger_name} on ${row.event_object_table}`);
    });

    // Check views
    const views = await client.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public'
      AND table_name IN ('conversation_analytics', 'audit_trail', 'conversation_graph')
    `);

    console.log("\n=== Views ===");
    views.rows.forEach((row) => {
      console.log(`✓ ${row.table_name}`);
    });
  } finally {
    client.release();
    await pool.end();
  }
}

checkConversationTables().catch(console.error);
