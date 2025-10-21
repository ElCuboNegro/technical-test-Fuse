# Database Seeding Requirements

## Introduction

A comprehensive database seeding system for populating all necessary tables with test data based on existing mock test scenarios. The system must create and populate identity_records, contact_information, financial_data, and application_data tables to support complete voice verification agent testing. The system must support separate test and production databases while maintaining security best practices for PII handling and using the established test data structure from tests/mock_test_data.json.

## Glossary

- **Identity_Records_Table**: PostgreSQL table storing hashed identity verification data (DOB, SSN last-4)
- **Contact_Information_Table**: PostgreSQL table storing mailing addresses and email data
- **Financial_Data_Table**: PostgreSQL table storing income and employment information
- **Application_Data_Table**: PostgreSQL table storing application-specific data and metadata
- **Test_Scenarios_Table**: PostgreSQL table storing test scenario metadata and expected outcomes
- **Seeding_System**: Automated process for populating all database tables with test data from mock scenarios
- **Mock_Test_Data**: JSON file containing predefined test scenarios with complete applicant data
- **Test_Database**: Separate PostgreSQL database instance for testing and development
- **Production_Database**: PostgreSQL database instance for production use
- **Hash_Function**: SHA-256 cryptographic function for securing sensitive data
- **External_Reference**: Unique identifier linking all related records across tables (scenario_name)

## Requirements

### Requirement 1

**User Story:** As a developer, I want to populate all necessary database tables with complete test data from mock_test_data.json, so that I can test the entire voice verification agent flow with consistent, predefined scenarios.

#### Acceptance Criteria

1. WHEN the seeding script is executed, THE Seeding_System SHALL read test scenarios from tests/mock_test_data.json
2. WHEN processing applicant data, THE Seeding_System SHALL create records in identity_records, contact_information, financial_data, and application_data tables
3. WHEN storing sensitive data, THE Seeding_System SHALL hash all PII using the configured salts
4. WHEN creating records, THE Seeding_System SHALL use scenario_name as the external_reference linking all related records
5. WHERE duplicate scenario_name values exist, THE Seeding_System SHALL update existing records rather than create duplicates

### Requirement 2

**User Story:** As a security engineer, I want all test data to be properly hashed and secured, so that no real PII is exposed even in test environments.

#### Acceptance Criteria

1. THE Seeding_System SHALL use the same hashing algorithm as the identity verification node
2. THE Seeding_System SHALL read salt values from environment variables (SSN_SALT, DOB_SALT)
3. THE Seeding_System SHALL never log or display raw SSN digits during execution
4. WHEN hashing fails, THE Seeding_System SHALL terminate with an error message
5. THE Seeding_System SHALL validate that all generated SSN last-4 values are exactly 4 digits

### Requirement 3

**User Story:** As a QA engineer, I want to seed both correct and incorrect identity data for comprehensive testing, so that I can validate both success and failure scenarios.

#### Acceptance Criteria

1. THE Seeding_System SHALL create records for successful verification scenarios using correct_date_of_birth and correct_ssn_last_four when available
2. THE Seeding_System SHALL create records for standard scenarios using date_of_birth and ssn_last_four fields
3. WHEN processing identity_verification_failure scenarios, THE Seeding_System SHALL seed the correct data for database verification
4. THE Seeding_System SHALL handle scenarios with first_attempt and second_attempt data structures
5. THE Seeding_System SHALL preserve the scenario descriptions and expected outcomes for test documentation

### Requirement 4

**User Story:** As a developer, I want to target specific database environments (test vs production), so that I can safely manage test data without affecting production systems.

#### Acceptance Criteria

1. THE Seeding_System SHALL support separate DATABASE_URL configurations for test and production environments
2. THE Seeding_System SHALL provide environment-specific seeding commands (--env=test, --env=production)
3. WHEN targeting test environment, THE Seeding_System SHALL use TEST_DATABASE_URL if available
4. THE Seeding_System SHALL prevent accidental seeding of production databases with test data
5. THE Seeding_System SHALL provide a reset operation that cleans and repopulates test data in one command

### Requirement 5

**User Story:** As a system administrator, I want Docker Compose to support separate test and production database instances, so that I can isolate test data from production data.

#### Acceptance Criteria

1. THE Docker_Compose_Configuration SHALL define separate postgres-test and postgres-prod services (docker-compose.dev.yml / docker-compose.yml)
2. THE Docker_Compose_Configuration SHALL use different database names for test and production environments
3. THE Docker_Compose_Configuration SHALL expose different ports for test and production databases
4. THE Docker_Compose_Configuration SHALL use separate volume mounts for test and production data persistence
5. THE Seeding_System SHALL validate database connectivity and schema before proceeding with seeding operations

### Requirement 6

**User Story:** As a developer, I want environment-specific configuration management, so that I can easily switch between test and production database connections.

#### Acceptance Criteria

1. THE Configuration_System SHALL support TEST_DATABASE_URL environment variable for test database connections
2. THE Configuration_System SHALL fall back to DATABASE_URL when TEST_DATABASE_URL is not set
3. WHEN running in test mode, THE Seeding_System SHALL validate that it's connecting to a test database
4. THE Seeding_System SHALL refuse to seed production databases with test scenario data
5. THE Configuration_System SHALL provide clear logging of which database environment is being used

### Requirement 7

**User Story:** As a database administrator, I want comprehensive database schema creation for all test data structures, so that the voice verification agent can access complete applicant information during testing.

#### Acceptance Criteria

1. THE Seeding_System SHALL create identity_records table with hashed DOB and SSN data
2. THE Seeding_System SHALL create contact_information table with mailing addresses and email data
3. THE Seeding_System SHALL create financial_data table with income and employment information
4. THE Seeding_System SHALL create application_data table with application-specific metadata
5. THE Seeding_System SHALL create test_scenarios table with scenario descriptions and expected outcomes
6. THE Seeding_System SHALL establish foreign key relationships between tables using external_reference
7. THE Seeding_System SHALL create appropriate indexes for query performance
8. THE Seeding_System SHALL handle all data types present in mock_test_data.json including nullable fields

### Requirement 8

**User Story:** As a database administrator, I want a comprehensive migration system to manage database schema changes, so that I can safely deploy and rollback database updates across environments.

#### Acceptance Criteria

1. THE Migration_System SHALL track all applied migrations in a schema_migrations table
2. THE Migration_System SHALL support forward migrations (up) and rollback migrations (down)
3. THE Migration_System SHALL validate migration checksums to detect unauthorized changes
4. THE Migration_System SHALL provide CLI commands for migration management (up, down, status, create)
5. THE Migration_System SHALL prevent running migrations on production without explicit confirmation
6. THE Migration_System SHALL support dry-run mode for testing migrations
7. THE Migration_System SHALL create migration files with standardized naming and format
8. THE Migration_System SHALL ensure migrations run in correct order based on version numbers
6. 