# Database Configuration Management

This module provides comprehensive database configuration management for the seeding system, addressing requirements 6.1, 6.2, 6.3, and 6.5 from the database seeding specification.

## Features

### ConfigurationManager

The `ConfigurationManager` class handles environment-specific database configurations:

- **Environment Variable Support**: Supports `TEST_DATABASE_URL` and `DATABASE_URL` environment variables
- **Fallback Logic**: Falls back to `DATABASE_URL` when `TEST_DATABASE_URL` is not set
- **Validation**: Validates all required environment variables are present
- **Secure Logging**: Masks sensitive information in database URLs for safe logging
- **Hashing Salts**: Manages `SSN_SALT` and `DOB_SALT` for secure PII processing

### Environment Detection

Advanced environment detection capabilities:

- **Automatic Detection**: Detects test vs production environments from database URLs
- **Confidence Levels**: Provides confidence levels (high/medium/low) for detection
- **Safety Validation**: Prevents accidental operations on wrong environments
- **Warning System**: Warns about potential environment mismatches

### Database Validation

Database connectivity and schema validation:

- **Connection Testing**: Tests database connectivity before operations
- **Schema Validation**: Validates required tables and indexes exist
- **Environment Safety**: Ensures operations are safe for the target environment

## Usage

### Basic Configuration

```typescript
import { ConfigurationManager } from './configuration/manager';

const configManager = new ConfigurationManager();

// Get database URL for specific environment
const testUrl = configManager.getDatabaseUrl('test');
const prodUrl = configManager.getDatabaseUrl('production');

// Validate environment variables
const validation = configManager.validateEnvironmentVariables();
if (!validation.isValid) {
  console.error('Configuration errors:', validation.errors);
}

// Get hashing salts
const salts = configManager.getHashingSalts();
```

### Environment Detection

```typescript
import { detectEnvironment, validateEnvironmentSafety } from './configuration/environment';

// Detect environment from URL
const detection = detectEnvironment('postgresql://user:pass@localhost:5433/test_db');
console.log(`Detected: ${detection.environment} (${detection.confidence} confidence)`);

// Validate environment safety
const safety = validateEnvironmentSafety('test', 'postgresql://user:pass@localhost:5433/test_db');
if (!safety.safe) {
  console.error('Environment safety errors:', safety.errors);
}
```

### Database Validation

```typescript
import { DatabaseValidator } from './validation/validator';

const validator = new DatabaseValidator();

// Test connection
const isConnected = await validator.validateConnection(databaseUrl);

// Validate schema
const schemaResult = await validator.validateSchema();
if (!schemaResult.tablesExist) {
  console.log('Missing tables:', schemaResult.missingElements);
}

// Validate environment
const envValid = await validator.validateEnvironment('test');
```

## Environment Variables

### Required

- `DATABASE_URL`: Primary database connection string
- `SSN_SALT`: Salt for hashing SSN data

### Optional

- `TEST_DATABASE_URL`: Dedicated test database connection string (falls back to `DATABASE_URL`)
- `DOB_SALT`: Salt for hashing date of birth data (falls back to `SSN_SALT`)

### Example Configuration

```bash
# Production database
DATABASE_URL=postgresql://user:password@prod-db:5432/app_prod

# Test database (optional)
TEST_DATABASE_URL=postgresql://user:password@localhost:5433/app_test

# Security salts
SSN_SALT=your-secure-ssn-salt-here
DOB_SALT=your-secure-dob-salt-here
```

## Environment Detection Logic

The system uses multiple indicators to detect environment types:

### Test Environment Indicators

**Strong Indicators (High Confidence)**:
- `_test` in database name
- `test_` prefix in database name
- `testing` in database name
- Port `:5433` (common test port)

**Weak Indicators (Medium Confidence)**:
- `localhost` hostname
- `127.0.0.1` hostname

### Production Environment Indicators

- `prod` or `production` in hostname
- `.amazonaws.com` or `.rds.` in hostname
- Port `:5432` (default PostgreSQL port)

### Safety Rules

1. **Test operations on production databases**: Blocked with error
2. **Production operations on test databases**: Allowed with warning
3. **Low confidence detection**: Warning issued
4. **Conflicting indicators**: Low confidence with warning

## Migration Integration

The configuration system integrates with the migration system:

```sql
-- Migration: 002_configuration_tables.sql
-- Creates system_variables and response_templates tables
-- Includes default configuration values
```

Default system variables created:
- `job_tenure_threshold_months`: 15
- `identity_verification_max_attempts`: 2
- `database_environment_indicators`: Test environment detection patterns

## Testing

Comprehensive test coverage includes:

- Environment variable validation
- Database URL handling and fallback logic
- Environment detection accuracy
- Safety validation
- Error handling and edge cases

Run tests:
```bash
npm test -- --testPathPattern="configuration"
```

## Demo

Run the configuration demo to see all features in action:

```bash
tsx src/database/examples/configuration-demo.ts
```

## Requirements Compliance

- **6.1**: ✅ Support for `TEST_DATABASE_URL` and `DATABASE_URL` environment variables
- **6.2**: ✅ Fallback to `DATABASE_URL` when `TEST_DATABASE_URL` is not set
- **6.3**: ✅ Database environment validation before operations
- **6.5**: ✅ Clear logging of database environment usage with masked sensitive data