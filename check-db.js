const { Pool } = require("pg");

async function checkDatabase() {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://dev_user:dev_password@localhost:5432/agents_app_dev",
  });

  try {
    // Check application_data metadata
    const appResult = await pool.query(
      "SELECT metadata FROM application_data LIMIT 1",
    );
    console.log(
      "Application metadata type:",
      typeof appResult.rows[0]?.metadata,
    );
    console.log("Application metadata value:", appResult.rows[0]?.metadata);

    // Check test_scenarios expected_flow
    const scenarioResult = await pool.query(
      "SELECT expected_flow FROM test_scenarios LIMIT 1",
    );
    console.log(
      "Scenario expected_flow type:",
      typeof scenarioResult.rows[0]?.expected_flow,
    );
    console.log(
      "Scenario expected_flow value:",
      scenarioResult.rows[0]?.expected_flow,
    );
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await pool.end();
  }
}

checkDatabase();
