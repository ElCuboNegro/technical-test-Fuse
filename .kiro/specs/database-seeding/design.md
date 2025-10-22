# Database Seeding System Design

## Overview

A comprehensive database seeding system that uses Docker Compose environment management for database separation while maintaining a single, clean connection architecture. The system populates all necessary tables with test data from mock scenarios to support complete voice verification agent testing.

## Architecture

### Core Design Principles

1. **Single Connection Pattern**: Use one DATABASE_URL that connects to whatever database Docker exposes
2. **Docker Environment Separation**: Leverage Docker Compose files to manage different database environments
3. **Security First**: Hash all PII data before storage, never log sensitive information
4. **Atomic Operations**: Ensure data consistency through transaction-based seeding
5. **Idempotent Design**: Support multiple runs without data corruption through upsert patterns

### System Architecture Diagram

```mermaid
graph TB
    subgraph "Docker Environment"
        DC[Docker Compose]
        PG[(PostgreSQL Container)]
        DC --> PG
    end
    
    subgraph "Application Layer"
        CLI[Seeding CLI]
        DM[DatabaseManager]
        CS[ConfigurationSystem]
        CLI --> DM
        DM --> CS
    end
    
    subgraph "Data Processing"
        MP[MockDataParser]
        IH[IdentityHasher]
        DS[DatabaseSeeder]
        MP --> IH
        IH --> DS
    end
    
    subgraph "Data Sources"
        MD[mock_test_data.json]
        ENV[Environment Variables]
        MD --> MP
        ENV --> CS
    end
    
    CLI --> MP
    DM --> PG
    DS --> DM
```

## Components and Interfaces

### 1. Configuration System

**Purpose**: Simplified configuration management using single DATABASE_URL

```typescript
interface DatabaseConfig {
  databaseUrl: string;
  databaseName: string;
  isProductionDatabase: boolean;
}

interface SecurityConfig {
  ssnSalt: string;
  dobSalt: string;
}

class ConfigurationManager {
  getDatabaseConfig(): DatabaseConfig
  getSecurityConfig(): SecurityConfig
  validateEnvironment(): boolean
  isProductionEnvironment(): boolean
}
```

**Key Features**:
- Single DATABASE_URL environment variable
- Database name extraction for environment validation
- Production safety checks based on database name patterns
- Environment variable validation and defaults

### 2. Database Connection Management

**Purpose**: Simplified connection pooling with single connection string

```typescript
interface ConnectionPool {
  query<T>(sql: string, params?: any[]): Promise<T[]>
  transaction<T>(callback: (client: any) => Promise<T>): Promise<T>
  validateConnection(): Promise<boolean>
  close(): Promise<void>
}

class DatabaseManager {
  private pool: Pool
  
  constructor(config: DatabaseConfig)
  getConnection(): ConnectionPool
  validateSchema(): Promise<boolean>
  getDatabaseName(): string
}
```

**Key Features**:
- Single connection pool for all operations
- Database name validation for environment safety
- Schema validation before seeding operations
- Graceful connection lifecycle management

### 3. Mock Data Processing

**Purpose**: Parse and validate test scenarios from JSON file

```typescript
interface TestScenario {
  scenario_name: string;
  description: string;
  identity: IdentityData;
  contact: ContactData;
  financial: FinancialData;
  application: ApplicationData;
  expected_outcome: string;
}

interface IdentityData {
  date_of_birth: string;
  ssn_last_four: string;
  correct_date_of_birth?: string;
  correct_ssn_last_four?: string;
}

class MockDataParser {
  parseTestScenarios(): Promise<TestScenario[]>
  validateScenarioData(scenario: TestScenario): boolean
  extractIdentityData(scenario: TestScenario): IdentityData
  extractContactData(scenario: TestScenario): ContactData
  extractFinancialData(scenario: TestScenario): FinancialData
}
```

**Key Features**:
- Comprehensive JSON parsing with validation
- Support for special case scenarios (identity_verification_failure)
- Data extraction for all table types
- Error handling for malformed data

### 4. Security and Hashing System

**Purpose**: Secure PII handling with consistent hashing

```typescript
interface HashedIdentity {
  dobHash: string;
  ssnLast4Hash: string;
  externalReference: string;
}

class IdentityHasher {
  hashDateOfBirth(dob: string): string
  hashSsnLast4(ssn: string): string
  validateSsnFormat(ssn: string): boolean
  validateDobFormat(dob: string): boolean
  createHashedIdentity(identity: IdentityData, externalRef: string): HashedIdentity
}
```

**Key Features**:
- SHA-256 hashing with environment-specific salts
- Input validation for SSN (4 digits) and DOB (ISO format)
- No raw PII in logs or error messages
- Consistent hashing for test repeatability

### 5. Database Seeding Engine

**Purpose**: Coordinate all table seeding operations

```typescript
interface SeedingResult {
  tableName: string;
  recordsProcessed: number;
  recordsInserted: number;
  recordsUpdated: number;
  errors: string[];
}

interface SeedingOptions {
  dryRun: boolean;
  batchSize: number;
  skipValidation: boolean;
}

class DatabaseSeeder {
  seedIdentityRecords(scenarios: TestScenario[]): Promise<SeedingResult>
  seedContactInformation(scenarios: TestScenario[]): Promise<SeedingResult>
  seedFinancialData(scenarios: TestScenario[]): Promise<SeedingResult>
  seedApplicationData(scenarios: TestScenario[]): Promise<SeedingResult>
  seedTestScenarios(scenarios: TestScenario[]): Promise<SeedingResult>
  seedAllTables(scenarios: TestScenario[], options: SeedingOptions): Promise<SeedingResult[]>
}
```

**Key Features**:
- Upsert operations based on external_reference
- Batch processing for performance
- Transaction-based operations for consistency
- Comprehensive result reporting

## Data Models

### Database Schema

The system works with existing database tables created by migrations:

```sql
-- Identity Records (hashed PII only)
CREATE TABLE identity_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref TEXT UNIQUE NOT NULL,
  dob_hash TEXT NOT NULL,
  ssn4_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Contact Information
CREATE TABLE contact_information (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref TEXT UNIQUE NOT NULL,
  street_address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  unit_number TEXT,
  email TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (external_ref) REFERENCES identity_records(external_ref)
);

-- Financial Data
CREATE TABLE financial_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref TEXT UNIQUE NOT NULL,
  monthly_income DECIMAL(10,2) NOT NULL,
  job_tenure_months INTEGER NOT NULL,
  employment_status TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (external_ref) REFERENCES identity_records(external_ref)
);

-- Application Data
CREATE TABLE application_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref TEXT UNIQUE NOT NULL,
  application_id TEXT,
  application_date TIMESTAMP,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (external_ref) REFERENCES identity_records(external_ref)
);

-- Test Scenarios Metadata
CREATE TABLE test_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_name TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  expected_outcome TEXT NOT NULL,
  scenario_type TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Data Flow

1. **Input**: Mock test data from `tests/mock_test_data.json`
2. **Processing**: Parse scenarios, validate data, hash PII
3. **Storage**: Upsert records across all tables with foreign key relationships
4. **Validation**: Verify data integrity and completeness

## Docker Environment Management

### Environment Separation Strategy

Instead of multiple database URLs, use Docker Compose environment management:

**Development Environment** (`docker-compose.dev.yml`):
```yaml
services:
  postgres:
    environment:
      POSTGRES_DB: multiagent_dev
      POSTGRES_USER: dev_user
      POSTGRES_PASSWORD: dev_password
```

**Production Environment** (`docker-compose.yml`):
```yaml
services:
  postgres:
    environment:
      POSTGRES_DB: multiagent_prod
      POSTGRES_USER: prod_user
      POSTGRES_PASSWORD: prod_password
```

### Connection Management

**Single DATABASE_URL Pattern**:
```bash
# Development
DATABASE_URL=postgresql://dev_user:dev_password@localhost:5432/multiagent_dev

# Production  
DATABASE_URL=postgresql://prod_user:prod_password@localhost:5432/multiagent_prod
```

**Environment Detection**:
- Extract database name from DATABASE_URL
- Validate against expected patterns (dev/test vs prod)
- Prevent accidental production seeding

## Error Handling

### Error Categories

1. **Configuration Errors**: Missing environment variables, invalid database URLs
2. **Connection Errors**: Database unavailable, authentication failures
3. **Data Errors**: Invalid mock data, missing required fields
4. **Security Errors**: Hashing failures, PII validation errors
5. **Database Errors**: Schema validation, constraint violations

### Error Recovery Strategies

```typescript
interface ErrorHandler {
  handleConfigurationError(error: ConfigurationError): void
  handleConnectionError(error: ConnectionError): Promise<boolean>
  handleDataError(error: DataError): void
  handleSecurityError(error: SecurityError): void
  handleDatabaseError(error: DatabaseError): Promise<boolean>
}

class SeedingErrorHandler implements ErrorHandler {
  // Retry logic for transient errors
  // Fail-fast for security violations
  // Detailed logging without PII exposure
  // Graceful degradation where possible
}
```

### Production Safety Measures

1. **Database Name Validation**: Refuse to seed production-named databases with test data
2. **Confirmation Prompts**: Require explicit confirmation for production operations
3. **Dry Run Mode**: Test operations without actual database changes
4. **Audit Logging**: Track all seeding operations with timestamps and results

## Testing Strategy

### Unit Testing

- **Configuration Management**: Environment variable handling, validation logic
- **Data Processing**: Mock data parsing, validation, transformation
- **Security**: Hashing functions, PII handling, input validation
- **Database Operations**: Individual seeding methods, error handling

### Integration Testing

- **End-to-End Seeding**: Complete workflow from JSON to database
- **Docker Environment**: Test with actual Docker Compose setup
- **Data Integrity**: Verify foreign key relationships, data consistency
- **Error Scenarios**: Test failure modes and recovery

### Test Data Management

- **Mock Scenarios**: Use existing `tests/mock_test_data.json`
- **Test Database**: Separate database for testing (multiagent_test)
- **Data Cleanup**: Automated cleanup between test runs
- **Scenario Coverage**: Test all scenario types from mock data

## Performance Considerations

### Optimization Strategies

1. **Batch Processing**: Process multiple records in single transactions
2. **Connection Pooling**: Reuse database connections efficiently
3. **Upsert Operations**: Minimize database round trips
4. **Parallel Processing**: Process independent tables concurrently
5. **Memory Management**: Stream large datasets to avoid memory issues

### Monitoring and Metrics

- **Seeding Duration**: Track time for complete seeding operations
- **Record Counts**: Monitor inserted/updated record statistics
- **Error Rates**: Track and alert on seeding failures
- **Database Performance**: Monitor connection pool usage and query performance

## Security Implementation

### PII Protection

1. **Hashing at Ingress**: Hash PII immediately upon processing
2. **No Raw Storage**: Never store unhashed SSN or DOB
3. **Logging Redaction**: Ensure no PII appears in logs or error messages
4. **Environment Isolation**: Separate salts for different environments

### Access Control

1. **Database Permissions**: Minimal required permissions for seeding operations
2. **Environment Variables**: Secure storage of salts and credentials
3. **Audit Trail**: Log all seeding operations without exposing PII
4. **Production Safeguards**: Multiple validation layers for production operations

This design provides a clean, maintainable, and secure foundation for the database seeding system while leveraging Docker's environment management capabilities for simplified configuration.