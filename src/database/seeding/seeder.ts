import { Pool } from 'pg';
import { 
  DatabaseSeeder as IDatabaseSeeder,
  TestScenario,
  SeedingResult,
  SeedingOptions,
  IdentityRecord,
  ContactInformation,
  FinancialData,
  ApplicationData,
  TestScenarioRecord
} from '../interfaces/index';
import { MockDataParser } from './parser';
import { IdentityHasher } from './hasher';

/**
 * DatabaseSeeder handles seeding all database tables with test data
 * Requirements addressed: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */
export class DatabaseSeeder implements IDatabaseSeeder {
  private pool: Pool;
  private parser: MockDataParser;
  private hasher: IdentityHasher;

  constructor(pool: Pool) {
    this.pool = pool;
    this.parser = new MockDataParser();
    this.hasher = new IdentityHasher();
  }

  /**
   * Seed identity_records table with batch processing
   */
  async seedIdentityRecords(scenarios: TestScenario[], batchSize: number = 100): Promise<SeedingResult> {
    const result: SeedingResult = {
      tableName: 'identity_records',
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      errors: []
    };

    // Process scenarios in batches
    for (let i = 0; i < scenarios.length; i += batchSize) {
      const batch = scenarios.slice(i, i + batchSize);
      await this.processBatchIdentityRecords(batch, result);
    }

    return result;
  }

  /**
   * Process a batch of identity records
   */
  private async processBatchIdentityRecords(scenarios: TestScenario[], result: SeedingResult): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const scenario of scenarios) {
        try {
          result.recordsProcessed++;

          // Extract and validate identity data
          const identityData = this.parser.extractIdentityData(scenario);
          const validation = this.hasher.validateIdentityData(identityData);

          if (!validation.isValid) {
            result.errors.push(`Invalid identity data for ${scenario.scenario_name}: ${validation.errors.join(', ')}`);
            continue;
          }

          // Create hashed identity
          const hashedIdentity = this.hasher.createHashedIdentity(identityData, scenario.scenario_name);

          // Use a more reliable upsert with xmax to detect insert vs update
          const insertResult = await client.query(`
            INSERT INTO identity_records (external_ref, name, dob, dob_hash, ssn4_hash)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (external_ref) DO UPDATE SET
              name = EXCLUDED.name,
              dob = EXCLUDED.dob,
              dob_hash = EXCLUDED.dob_hash,
              ssn4_hash = EXCLUDED.ssn4_hash,
              updated_at = NOW()
            RETURNING id, external_ref, (xmax = 0) AS inserted
          `, [
            scenario.scenario_name,
            scenario.applicant_data.name,
            identityData.date_of_birth,
            hashedIdentity.dobHash,
            hashedIdentity.ssnLast4Hash
          ]);

          if (insertResult.rows[0].inserted) {
            result.recordsInserted++;
          } else {
            result.recordsUpdated++;
          }

        } catch (error) {
          result.errors.push(`Failed to seed identity for ${scenario.scenario_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Seed contact_information table with batch processing
   */
  async seedContactInformation(scenarios: TestScenario[], batchSize: number = 100): Promise<SeedingResult> {
    const result: SeedingResult = {
      tableName: 'contact_information',
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      errors: []
    };

    // Process scenarios in batches
    for (let i = 0; i < scenarios.length; i += batchSize) {
      const batch = scenarios.slice(i, i + batchSize);
      await this.processBatchContactInformation(batch, result);
    }

    return result;
  }

  /**
   * Process a batch of contact information records
   */
  private async processBatchContactInformation(scenarios: TestScenario[], result: SeedingResult): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const scenario of scenarios) {
        try {
          // Skip scenarios without contact data
          if (!scenario.applicant_data.mailing_address && !scenario.applicant_data.complete_address) {
            continue;
          }

          result.recordsProcessed++;

          const contactData = this.parser.extractContactData(scenario);

          const insertResult = await client.query(`
            INSERT INTO contact_information (external_ref, street_address, unit_number, city, state, zip_code, email)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (external_ref) DO UPDATE SET
              street_address = EXCLUDED.street_address,
              unit_number = EXCLUDED.unit_number,
              city = EXCLUDED.city,
              state = EXCLUDED.state,
              zip_code = EXCLUDED.zip_code,
              email = EXCLUDED.email,
              updated_at = NOW()
            RETURNING id, external_ref, (xmax = 0) AS inserted
          `, [
            scenario.scenario_name,
            contactData.street_address,
            contactData.unit_number,
            contactData.city,
            contactData.state,
            contactData.zip_code,
            contactData.email
          ]);

          if (insertResult.rows[0].inserted) {
            result.recordsInserted++;
          } else {
            result.recordsUpdated++;
          }

        } catch (error) {
          result.errors.push(`Failed to seed contact info for ${scenario.scenario_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Seed financial_data table with batch processing
   */
  async seedFinancialData(scenarios: TestScenario[], batchSize: number = 100): Promise<SeedingResult> {
    const result: SeedingResult = {
      tableName: 'financial_data',
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      errors: []
    };

    // Process scenarios in batches
    for (let i = 0; i < scenarios.length; i += batchSize) {
      const batch = scenarios.slice(i, i + batchSize);
      await this.processBatchFinancialData(batch, result);
    }

    return result;
  }

  /**
   * Process a batch of financial data records
   */
  private async processBatchFinancialData(scenarios: TestScenario[], result: SeedingResult): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const scenario of scenarios) {
        try {
          // Skip scenarios without financial data
          if (scenario.applicant_data.monthly_income === undefined) {
            continue;
          }

          result.recordsProcessed++;

          const financialData = this.parser.extractFinancialData(scenario);

          const insertResult = await client.query(`
            INSERT INTO financial_data (external_ref, monthly_income, job_tenure_months, employment_status, application_job_tenure, job_change_reason)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (external_ref) DO UPDATE SET
              monthly_income = EXCLUDED.monthly_income,
              job_tenure_months = EXCLUDED.job_tenure_months,
              employment_status = EXCLUDED.employment_status,
              application_job_tenure = EXCLUDED.application_job_tenure,
              job_change_reason = EXCLUDED.job_change_reason,
              updated_at = NOW()
            RETURNING id, external_ref, (xmax = 0) AS inserted
          `, [
            scenario.scenario_name,
            financialData.monthly_income,
            financialData.job_tenure_months,
            financialData.employment_status,
            financialData.application_job_tenure,
            financialData.job_change_reason
          ]);

          if (insertResult.rows[0].inserted) {
            result.recordsInserted++;
          } else {
            result.recordsUpdated++;
          }

        } catch (error) {
          result.errors.push(`Failed to seed financial data for ${scenario.scenario_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Seed application_data table with batch processing
   */
  async seedApplicationData(scenarios: TestScenario[], batchSize: number = 100): Promise<SeedingResult> {
    const result: SeedingResult = {
      tableName: 'application_data',
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      errors: []
    };

    // Process scenarios in batches
    for (let i = 0; i < scenarios.length; i += batchSize) {
      const batch = scenarios.slice(i, i + batchSize);
      await this.processBatchApplicationData(batch, result);
    }

    return result;
  }

  /**
   * Process a batch of application data records
   */
  private async processBatchApplicationData(scenarios: TestScenario[], result: SeedingResult): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const scenario of scenarios) {
        try {
          result.recordsProcessed++;

          const applicationId = `APP_${scenario.scenario_name}`;
          const status = scenario.expected_outcome === 'failure' ? 'rejected' : 'pending';
          const notes = `Test application for ${scenario.description}`;
          const metadata = {
            test: true,
            scenario: scenario.scenario_name,
            expected_outcome: scenario.expected_outcome,
            failure_reason: scenario.failure_reason
          };

          const insertResult = await client.query(`
            INSERT INTO application_data (external_ref, application_id, status, notes, metadata)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (external_ref) DO UPDATE SET
              application_id = EXCLUDED.application_id,
              status = EXCLUDED.status,
              notes = EXCLUDED.notes,
              metadata = EXCLUDED.metadata,
              updated_at = NOW()
            RETURNING id, external_ref, (xmax = 0) AS inserted
          `, [
            scenario.scenario_name,
            applicationId,
            status,
            notes,
            JSON.stringify(metadata)
          ]);

          if (insertResult.rows[0].inserted) {
            result.recordsInserted++;
          } else {
            result.recordsUpdated++;
          }

        } catch (error) {
          result.errors.push(`Failed to seed application data for ${scenario.scenario_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Seed test_scenarios table with batch processing
   */
  async seedTestScenarios(scenarios: TestScenario[], batchSize: number = 100): Promise<SeedingResult> {
    const result: SeedingResult = {
      tableName: 'test_scenarios',
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      errors: []
    };

    // Process scenarios in batches
    for (let i = 0; i < scenarios.length; i += batchSize) {
      const batch = scenarios.slice(i, i + batchSize);
      await this.processBatchTestScenarios(batch, result);
    }

    return result;
  }

  /**
   * Process a batch of test scenario records
   */
  private async processBatchTestScenarios(scenarios: TestScenario[], result: SeedingResult): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const scenario of scenarios) {
        try {
          result.recordsProcessed++;

          const scenarioType = this.determineScenarioType(scenario);

          const insertResult = await client.query(`
            INSERT INTO test_scenarios (scenario_name, description, expected_outcome, scenario_type, expected_flow, failure_reason, applicant_name)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (scenario_name) DO UPDATE SET
              description = EXCLUDED.description,
              expected_outcome = EXCLUDED.expected_outcome,
              scenario_type = EXCLUDED.scenario_type,
              expected_flow = EXCLUDED.expected_flow,
              failure_reason = EXCLUDED.failure_reason,
              applicant_name = EXCLUDED.applicant_name,
              updated_at = NOW()
            RETURNING id, scenario_name, (xmax = 0) AS inserted
          `, [
            scenario.scenario_name,
            scenario.description,
            scenario.expected_outcome,
            scenarioType,
            JSON.stringify(scenario.expected_flow),
            scenario.failure_reason,
            scenario.applicant_data.name
          ]);

          if (insertResult.rows[0].inserted) {
            result.recordsInserted++;
          } else {
            result.recordsUpdated++;
          }

        } catch (error) {
          result.errors.push(`Failed to seed test scenario for ${scenario.scenario_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Seed all tables with test data
   */
  async seedAllTables(scenarios: TestScenario[], options: SeedingOptions = { dryRun: false, batchSize: 100, skipValidation: false }): Promise<SeedingResult[]> {
    console.log(`\n=== Starting database seeding for ${scenarios.length} scenarios ===`);

    if (options.dryRun) {
      console.log('🔍 DRY RUN MODE - No data will be committed');
      return this.performDryRun(scenarios, options);
    }

    const results: SeedingResult[] = [];

    try {
      // Seed in dependency order with batch processing
      console.log(`\n1. Seeding identity records (batch size: ${options.batchSize})...`);
      const identityResult = await this.seedIdentityRecords(scenarios, options.batchSize);
      results.push(identityResult);
      console.log(`✓ Seeded ${identityResult.recordsInserted} identity records (${identityResult.recordsUpdated} updated)`);

      console.log('\n2. Seeding contact information...');
      const contactResult = await this.seedContactInformation(scenarios, options.batchSize);
      results.push(contactResult);
      console.log(`✓ Seeded ${contactResult.recordsInserted} contact records (${contactResult.recordsUpdated} updated)`);

      console.log('\n3. Seeding financial data...');
      const financialResult = await this.seedFinancialData(scenarios, options.batchSize);
      results.push(financialResult);
      console.log(`✓ Seeded ${financialResult.recordsInserted} financial records (${financialResult.recordsUpdated} updated)`);

      console.log('\n4. Seeding application data...');
      const applicationResult = await this.seedApplicationData(scenarios, options.batchSize);
      results.push(applicationResult);
      console.log(`✓ Seeded ${applicationResult.recordsInserted} application records (${applicationResult.recordsUpdated} updated)`);

      console.log('\n5. Seeding test scenarios...');
      const scenarioResult = await this.seedTestScenarios(scenarios, options.batchSize);
      results.push(scenarioResult);
      console.log(`✓ Seeded ${scenarioResult.recordsInserted} test scenario records (${scenarioResult.recordsUpdated} updated)`);

      // Summary
      const totalProcessed = results.reduce((sum, r) => sum + r.recordsProcessed, 0);
      const totalInserted = results.reduce((sum, r) => sum + r.recordsInserted, 0);
      const totalUpdated = results.reduce((sum, r) => sum + r.recordsUpdated, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

      console.log(`\n=== Seeding Summary ===`);
      console.log(`Records processed: ${totalProcessed}`);
      console.log(`Records inserted: ${totalInserted}`);
      console.log(`Records updated: ${totalUpdated}`);
      console.log(`Errors: ${totalErrors}`);

      if (totalErrors > 0) {
        console.log('\nErrors encountered:');
        results.forEach(result => {
          if (result.errors.length > 0) {
            console.log(`${result.tableName}:`);
            result.errors.forEach(error => console.log(`  - ${error}`));
          }
        });
      }

      console.log('✓ Database seeding completed successfully');

    } catch (error) {
      console.error('✗ Database seeding failed:', error);
      throw error;
    }

    return results;
  }

  /**
   * Perform dry run simulation without database changes
   */
  private async performDryRun(scenarios: TestScenario[], options: SeedingOptions): Promise<SeedingResult[]> {
    const results: SeedingResult[] = [];

    console.log('\n🔍 DRY RUN - Simulating database operations...');

    // Simulate each table seeding
    const tableNames = ['identity_records', 'contact_information', 'financial_data', 'application_data', 'test_scenarios'];
    
    for (const tableName of tableNames) {
      const result: SeedingResult = {
        tableName,
        recordsProcessed: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        errors: []
      };

      console.log(`\n📋 Would seed ${tableName}...`);

      for (const scenario of scenarios) {
        try {
          result.recordsProcessed++;

          // Simulate validation based on table type
          switch (tableName) {
            case 'identity_records':
              const identityData = this.parser.extractIdentityData(scenario);
              const validation = this.hasher.validateIdentityData(identityData);
              if (!validation.isValid) {
                result.errors.push(`Invalid identity data for ${scenario.scenario_name}: ${validation.errors.join(', ')}`);
                continue;
              }
              break;
            case 'contact_information':
              if (!scenario.applicant_data.mailing_address && !scenario.applicant_data.complete_address) {
                continue; // Skip scenarios without contact data
              }
              this.parser.extractContactData(scenario);
              break;
            case 'financial_data':
              if (scenario.applicant_data.monthly_income === undefined) {
                continue; // Skip scenarios without financial data
              }
              this.parser.extractFinancialData(scenario);
              break;
          }

          // Simulate insert (all would be inserts in dry run)
          result.recordsInserted++;

        } catch (error) {
          result.errors.push(`Would fail to seed ${tableName} for ${scenario.scenario_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      console.log(`📊 Would process ${result.recordsProcessed} records, insert ${result.recordsInserted}, errors: ${result.errors.length}`);
      results.push(result);
    }

    console.log('\n✅ DRY RUN completed - No actual changes made to database');
    return results;
  }

  /**
   * Determine scenario type based on scenario name and data
   */
  private determineScenarioType(scenario: TestScenario): string {
    const name = scenario.scenario_name.toLowerCase();

    if (name.includes('identity_verification_failure')) {
      return 'identity_failure';
    }
    if (name.includes('job_tenure_discrepancy') || name.includes('recent_job_change')) {
      return 'tenure_discrepancy';
    }
    if (name.includes('self_employed')) {
      return 'self_employed';
    }
    if (name.includes('address') && name.includes('clarification')) {
      return 'address_clarification';
    }
    if (name.includes('partial') && name.includes('failure')) {
      return 'partial_failure';
    }

    return 'standard';
  }
}