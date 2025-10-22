# Database Seeding System Documentation

## Overview

The Database Seeding System provides comprehensive mock data management for the Voice Verification Agent application. It supports all verification flow scenarios with proper security measures for PII handling and maintains referential integrity across all database tables.

## Architecture

### Core Components

```
src/database/seeding/
├── index.ts           # Main exports and public API
├── seeder.ts          # DatabaseSeeder class - core seeding logic
├── parser.ts          # MockDataParser - JSON data parsing
├── validator.ts       # DatabaseValidator - connection and schema validation
└── hasher.ts          # IdentityHasher - secure PII hashing
```

### Database Schema

The seeding system manages five core tables:

1. **identity_records**: Stores hashed PII data for identity verification
2. **contact_information**: Address and contact details
3. **financial_data**: Employment and income information  
4. **application_data**: Application metadata and status
5. **test_scenarios**: Scenario definitions and expected outcomes

## Test Scenarios

The system supports comprehensive test scenarios from `tests/mock_test_data.json`:

### Scenario Types

1. **successful_verification**: Complete successful flow
2. **identity_verification_failure**: Failed identity verification (2 attempts)
3. **job_tenure_discrepancy**: Employment history mismatch
4. **self_employed_applicant**: Variable income handling
5. **address_clarification**: Unit number collection
6. **partial_identity_failure_then_success**: Recovery workflow

### Data Structure

Each test scenario includes:

```typescript
interface TestScenario {
  scenario_name: string;
  description: string;
  applicant_data: {
    name: string;
    date_of_birth: string;
    ssn_last_four: string;
    monthly_income: number;
    employment_status?: string;
    job_tenure_months?: number;
    // ... additional fields
  };
  expected_flow: string[];
  expected_outcome: string;
}
```

## Security Features

### PII Protection

- **Hashed Storage**: DOB and SSN stored as SHA-256 hashes
- **Environment Salts**: Unique salts per environment (DOB_SALT, SSN_SALT)
- **Test Safety**: Raw PII only in test scenarios, never in production logs
- **Audit Trail**: Comprehensive logging without PII exposure

### Identity Verification Data

For identity verification failure scenarios, the system handles both:
- **Provided Data**: What the user provides (incorrect)
- **Correct Data**: What should be in the database (for verification)

## API Reference

### DatabaseSeeder Class

#### Constructor
```typescript
constructor(pool: Pool)
```

#### Methods

##### seedAllTables(scenarios, options?)
Seeds all tables with provided scenarios.

```typescript
async seedAllTables(
  scenarios: TestScenario[], 
  options?: SeedingOptions
): Promise<SeedingResult[]>
```

**Options:**
- `dryRun: boolean` - Preview changes without applying them
- `batchSize: number` - Number of records to process per batch (default: 100)
- `skipValidation: boolean` - Skip pre-seeding validation checks

**Returns:** Array of `SeedingResult` objects with statistics for each table.

##### Individual Table Methods

```typescript
async seedIdentityRecords(scenarios: TestScenario[]): Promise<SeedingResult>
async seedContactInformation(scenarios: TestScenario[]): Promise<SeedingResult>
async seedFinancialData(scenarios: TestScenario[]): Promise<SeedingResult>
async seedApplicationData(scenarios: TestScenario[]): Promise<SeedingResult>
async seedTestScenarios(scenarios: TestScenario[]): Promise<SeedingResult>
```

### MockDataParser Class

#### parseTestScenarios()
Parses test scenarios from the mock data file.

```typescript
async parseTestScenarios(): Promise<TestScenario[]>
```

### DatabaseValidator Class

#### validateConnection(databaseUrl)
Validates database connectivity.

```typescript
async validateConnection(databaseUrl: string): Promise<boolean>
```

#### validateSchema()
Validates that required tables and indexes exist.

```typescript
async validateSchema(): Promise<SchemaValidationResult>
```

## Usage Examples

### Basic Seeding

```typescript
import { Pool } from 'pg';
import { DatabaseSeeder, MockDataParser } from './src/database/seeding';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const seeder = new DatabaseSeeder(pool);
const parser = new MockDataParser();

// Parse and seed all data
const scenarios = await parser.parseTestScenarios();
const results = await seeder.seedAllTables(scenarios);

console.log(`Seeded ${results.length} tables successfully`);
```

### Dry Run Mode

```typescript
// Preview changes without applying them
const results = await seeder.seedAllTables(scenarios, {
  dryRun: true,
  batchSize: 50
});

results.forEach(result => {
  console.log(`Would process ${result.recordsProcessed} records in ${result.tableName}`);
});
```

### Individual Table Seeding

```typescript
// Seed only identity records
await seeder.seedIdentityRecords(scenarios);

// Seed contact information (requires identity records to exist)
await seeder.seedContactInformation(scenarios);
```

### Error Handling

```typescript
try {
  const results = await seeder.seedAllTables(scenarios);
  
  // Check for errors
  const hasErrors = results.some(result => result.errors.length > 0);
  if (hasErrors) {
    console.error('Seeding completed with errors:');
    results.forEach(result => {
      if (result.errors.length > 0) {
        console.error(`${result.tableName}: ${result.errors.join(', ')}`);
      }
    });
  }
} catch (error) {
  console.error('Seeding failed:', error.message);
}
```

## Testing

### Test Structure

The testing suite includes comprehensive coverage at multiple levels:

#### Unit Tests (`tests/unit/`)
- **database-seeding.test.ts**: Core seeding logic and data transformations
- **database-seeder-logic.test.ts**: Individual seeder methods and error handling

#### Integration Tests (`tests/integration/`)
- **database-seeding.test.ts**: End-to-end seeding workflows with real database

### Test Categories

#### Complete Seeding Process
- All tables seeded with mock data scenarios
- Data integrity across foreign key relationships
- Scenario type handling (successful, failure, discrepancy cases)

#### Upsert Logic and Duplicate Handling
- Insert operations on first run
- Update operations on subsequent runs
- Mixed insert/update scenarios
- Referential integrity during upserts

#### Individual Table Seeding
- Identity records with hashed PII data
- Contact information with address validation
- Financial data with employment information
- Application data with metadata handling
- Test scenarios with expected outcomes

#### Error Handling and Edge Cases
- Missing optional data scenarios
- Identity verification failure handling
- Partial failure recovery workflows
- Database error rollback scenarios

#### Performance and Batch Processing
- Large dataset efficiency testing
- Dry run mode validation
- Configurable batch size handling

### Running Tests

```bash
# Run all seeding tests
npm test -- --testPathPattern=database-seeding

# Run unit tests only
npm test tests/unit/database-seeding.test.ts

# Run integration tests only
npm test tests/integration/database-seeding.test.ts

# Run with coverage
npm test -- --coverage --testPathPattern=database-seeding
```

## Configuration

### Environment Variables

```bash
# Database connections
DATABASE_URL=postgresql://user:password@localhost:5432/agents_app
TEST_DATABASE_URL=postgresql://test:test@localhost:5433/agents_app_test

# Security salts for PII hashing
DOB_SALT=your-unique-dob-salt-here
SSN_SALT=your-unique-ssn-salt-here
```

### Database Setup

```bash
# Run migrations to create tables
npm run migrate

# Seed test data
npm run seed

# Clean and re-seed
npm run seed:clean && npm run seed
```

## Performance Considerations

### Batch Processing

The seeder uses configurable batch processing to handle large datasets efficiently:

```typescript
// Process in smaller batches for memory efficiency
const results = await seeder.seedAllTables(scenarios, {
  batchSize: 50  // Process 50 records at a time
});
```

### Connection Pooling

Uses PostgreSQL connection pooling for optimal database performance:

```typescript
const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,                    // Maximum connections
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000
});
```

### Transaction Management

All seeding operations use database transactions for consistency:
- Automatic rollback on errors
- Batch commits for performance
- Foreign key constraint handling

## Troubleshooting

### Common Issues

#### Connection Errors
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution**: Ensure PostgreSQL is running and DATABASE_URL is correct.

#### Missing Tables
```
Error: relation "identity_records" does not exist
```
**Solution**: Run database migrations first: `npm run migrate`

#### Foreign Key Violations
```
Error: insert or update on table violates foreign key constraint
```
**Solution**: Ensure identity_records are seeded before dependent tables.

#### Hash Salt Errors
```
Error: DOB_SALT environment variable is required
```
**Solution**: Set DOB_SALT and SSN_SALT environment variables.

### Debug Mode

Enable verbose logging for troubleshooting:

```typescript
const results = await seeder.seedAllTables(scenarios, {
  dryRun: true,  // Preview operations
  skipValidation: false  // Run all validation checks
});
```

## Security Best Practices

1. **Environment Isolation**: Use separate databases for test/production
2. **Salt Management**: Use unique, secure salts per environment
3. **PII Handling**: Never log raw SSN or DOB data
4. **Access Control**: Limit database permissions for seeding operations
5. **Audit Logging**: Maintain audit trails without exposing sensitive data

## Contributing

When extending the seeding system:

1. **Add Tests First**: Write unit and integration tests for new functionality
2. **Security Review**: Ensure no PII exposure in logs or error messages
3. **Documentation**: Update this documentation for new features
4. **Performance**: Consider batch processing for large datasets
5. **Validation**: Add appropriate data validation for new fields

## Migration Guide

### From Manual Seeding

If migrating from manual database seeding:

1. Export existing test data to JSON format matching `TestScenario` interface
2. Update foreign key references to use `external_ref` pattern
3. Run seeding system to validate data integrity
4. Update test suites to use new seeded data

### Schema Changes

When adding new tables or fields:

1. Create database migration first
2. Update `TestScenario` interface in `src/database/interfaces.ts`
3. Add parsing logic in `MockDataParser`
4. Implement seeding method in `DatabaseSeeder`
5. Add comprehensive tests for new functionality