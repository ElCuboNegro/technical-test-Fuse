# Voice Verification Agent - Multi-Node Learning System

A LangGraph-based multi-agent AI application for voice verification workflows, built with Next.js, TypeScript, and PostgreSQL.

## Overview

This project implements a comprehensive voice verification system with multi-step financial verification conversations, featuring strict identity gates, professional failure handling, and voice-optimized responses.

## Architecture

### Core Components

- **LangGraph Agents**: Multi-node conversation flows with state management
- **Database Layer**: PostgreSQL with comprehensive seeding and testing infrastructure
- **Voice Interface**: TTS-optimized responses and conversation patterns
- **Security Layer**: Identity verification gates and PII protection

### Project Structure

```
├── apps/                    # Application modules
├── src/
│   └── database/
│       ├── seeding/         # Database seeding system
│       ├── connection/      # Database connection management
│       └── cli/            # Command-line tools
├── tests/
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── setup/             # Test configuration
├── migrations/             # Database migrations
└── docker/                # Docker configurations
```

## Database Seeding System

### Features

The database seeding system provides comprehensive mock data management for testing voice verification scenarios:

- **Complete Mock Data Scenarios**: Supports all verification flow types including successful verification, identity failures, job tenure discrepancies, and self-employed applicants
- **Upsert Logic**: Intelligent insert/update operations with duplicate handling
- **Foreign Key Management**: Maintains referential integrity across all tables
- **PII Security**: Proper hashing of sensitive data (DOB, SSN) with test-safe storage
- **Batch Processing**: Efficient handling of large datasets with configurable batch sizes
- **Dry Run Mode**: Safe testing without data modification

### Supported Tables

1. **identity_records**: Hashed PII data for identity verification
2. **contact_information**: Address and contact details
3. **financial_data**: Employment and income information
4. **application_data**: Application metadata and status
5. **test_scenarios**: Scenario definitions and expected outcomes

### Usage

#### Command Line Interface

```bash
# Seed all tables with mock data
npm run seed

# Seed specific table
npm run seed -- --table identity_records

# Dry run (no actual data changes)
npm run seed -- --dry-run

# Custom batch size
npm run seed -- --batch-size 50
```

#### Programmatic Usage

```typescript
import { DatabaseSeeder } from './src/database/seeding/seeder';
import { MockDataParser } from './src/database/seeding/parser';

const seeder = new DatabaseSeeder(pool);
const parser = new MockDataParser();

// Parse test scenarios
const scenarios = await parser.parseTestScenarios();

// Seed all tables
const results = await seeder.seedAllTables(scenarios, {
  dryRun: false,
  batchSize: 100,
  skipValidation: false
});

// Seed individual tables
await seeder.seedIdentityRecords(scenarios);
await seeder.seedContactInformation(scenarios);
await seeder.seedFinancialData(scenarios);
```

## Testing Infrastructure

### Test Configuration

The testing system uses a sophisticated configuration setup that automatically loads environment variables and provides intelligent fallbacks:

- **Environment Loading**: Automatically loads `.env` file configuration using dotenv
- **Dynamic Database URLs**: Constructs test database URLs from the base DATABASE_URL
- **Security Fallbacks**: Provides secure default values for test salts when not specified
- **Console Mocking**: Reduces test noise by mocking console output methods

### Test Environment Setup

The Jest configuration (`tests/setup/jest.setup.ts`) provides:

```typescript
// Automatic environment variable loading
dotenv.config();

// Intelligent database URL handling
const baseUrl = process.env.DATABASE_URL || 'postgresql://dev_user:dev_password@localhost:5432/agents_app_dev';
const testDbUrl = baseUrl.replace('/agents_app_dev', '/agents_app_test');

// Security with fallbacks
process.env.SSN_SALT = process.env.SSN_SALT || 'test-ssn-salt-12345';
process.env.DOB_SALT = process.env.DOB_SALT || 'test-dob-salt-67890';
```

### Test Coverage

The project includes comprehensive testing at multiple levels:

#### Unit Tests
- **Database Seeder Logic**: Core seeding algorithms and data transformations
- **Mock Data Parsing**: JSON parsing and validation logic
- **Database Validation**: Connection and schema validation utilities

#### Integration Tests
- **Comprehensive Scenarios**: Complete end-to-end testing of all verification scenarios with real database operations
- **Complete Seeding Process**: End-to-end seeding workflows with all mock data scenarios
- **Data Integrity Validation**: Foreign key relationships and referential integrity across all tables
- **Upsert Logic**: Insert/update operations and duplicate handling
- **Error Handling**: Database errors, rollback scenarios, and edge cases
- **Performance Testing**: Large dataset handling and batch processing efficiency
- **PII Security Validation**: Hash consistency and secure data handling verification

### Test Scenarios

The system supports comprehensive test scenarios including:

1. **successful_verification**: Standard employed applicant flow with complete data validation
2. **identity_verification_failure**: Multiple failed identity attempts with proper termination
3. **job_tenure_discrepancy**: Employment history mismatches requiring clarification
4. **self_employed_applicant**: Variable income handling with null job tenure
5. **address_with_unit_clarification**: Unit number collection and address completion
6. **partial_identity_failure_then_success**: Recovery workflows with attempt tracking
7. **no_email_provided**: Optional email handling scenarios
8. **recent_job_change**: Job transition scenarios with explanatory data

#### Comprehensive Integration Testing

The `comprehensive-scenarios.test.ts` file provides complete end-to-end validation:

- **Successful Verification Flows**: Tests complete data flow from identity verification through final confirmation
- **Identity Failure Scenarios**: Validates proper handling of verification failures and professional termination
- **Special Case Handling**: Tests job tenure discrepancies, address clarifications, and self-employed scenarios
- **Data Integrity Validation**: Ensures foreign key relationships and PII hashing consistency
- **Database Connection Resilience**: Graceful handling when database is unavailable

### Running Tests

```bash
# Run all tests (automatically loads .env configuration)
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/integration/database-seeding.test.ts

# Run comprehensive scenario tests
npm test -- tests/integration/comprehensive-scenarios.test.ts

# Run tests with database connection validation
npm test -- --testNamePattern="Comprehensive Test Scenarios"
```

**Test Environment Notes**:
- Tests automatically load environment variables from `.env` file
- Test database URLs are dynamically constructed from your main DATABASE_URL
- Security salts use secure fallbacks if not specified in environment
- Console output is mocked to reduce test noise

## Database Setup

### Prerequisites

- PostgreSQL 14+
- Node.js 18+
- Docker (optional)

### Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Configure database URLs
DATABASE_URL=postgresql://user:password@localhost:5432/agents_app_dev

# Security salts for PII hashing (optional - tests provide fallbacks)
DOB_SALT=your-dob-salt-here
SSN_SALT=your-ssn-salt-here
```

**Note**: The test system automatically constructs test database URLs from your main DATABASE_URL by replacing the database name with `_test` suffix. For example:
- Main: `postgresql://user:pass@localhost:5432/agents_app_dev`
- Test: `postgresql://user:pass@localhost:5432/agents_app_test`

Security salts are optional for testing - the system provides secure fallback values when not specified.

### Database Migration

```bash
# Run migrations
npm run migrate

# Rollback migrations
npm run migrate:rollback

# Create new migration
npm run migrate:create -- migration_name
```

### Docker Setup

```bash
# Start all services
docker-compose up -d

# Start development environment
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose logs -f
```

## Security Features

### PII Protection

- **Hashed Storage**: DOB and SSN data stored as SHA-256 hashes
- **Test Data Safety**: Raw PII only in test scenarios, never in production
- **Audit Logging**: Comprehensive logging without PII exposure
- **Environment Isolation**: Separate test and production databases

### Identity Verification

- **Hard Security Gates**: Mandatory identity verification checkpoints
- **Attempt Limiting**: Maximum 2 verification attempts before termination
- **Professional Failure Handling**: Respectful call termination scripts
- **Session Isolation**: Conversation state isolation across sessions

## Voice Interface Optimization

### TTS-Friendly Formatting

- **Number Spelling**: SSN digits spelled individually (7-2-3-4)
- **Email Confirmation**: Letter-by-letter spelling verification
- **Date Formatting**: Natural speech patterns for dates
- **Financial Terms**: Clear pronunciation of monetary amounts

### Conversation Patterns

- **Professional Tone**: Consistent professional communication
- **Confirmation Loops**: Accuracy verification at each step
- **Error Recovery**: Graceful handling of misunderstandings
- **Termination Scripts**: Respectful failure communication

## Development

### Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Run database migrations
npm run migrate

# Seed test data
npm run seed

# Run tests
npm test

# Start development server
npm run dev
```

### Code Quality

- **TypeScript Strict Mode**: Comprehensive type safety
- **ESLint Configuration**: Code quality enforcement
- **Jest Testing**: Unit and integration test coverage
- **Prettier Formatting**: Consistent code formatting

### Contributing

1. Follow atomic development principles - one feature at a time
2. Write tests before implementation
3. Ensure all tests pass before committing
4. Use meaningful commit messages
5. Update documentation for new features

## Monitoring and Observability

### Health Checks

- Database connection validation
- Schema integrity verification
- Seeding process monitoring
- Test execution tracking

### Logging

- Structured logging with correlation IDs
- PII-safe audit trails
- Performance metrics
- Error tracking and alerting

## Deployment

### Production Checklist

- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Security salts generated
- [ ] Health checks passing
- [ ] Monitoring configured
- [ ] Backup strategy implemented

### Docker Deployment

```bash
# Build production image
docker build -t voice-verification-agent .

# Run with docker-compose
docker-compose -f docker-compose.yml up -d
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions or issues, please refer to the project documentation or create an issue in the repository.