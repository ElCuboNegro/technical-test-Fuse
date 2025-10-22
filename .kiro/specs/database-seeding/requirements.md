# Database Seeding Requirements

## Introduction

A comprehensive database seeding system for populating all necessary tables with test data based on existing mock test scenarios. The system must create and populate identity_records, contact_information, financial_data, and application_data tables to support complete voice verification agent testing. The system uses Docker Compose environment management for database separation while maintaining security best practices for PII handling and using the established test data structure from tests/mock_test_data.json.

## Glossary

- **Identity_Records_Table**: PostgreSQL table storing hashed identity verification data (DOB, SSN last-4)
- **Contact_Information_Table**: PostgreSQL table storing mailing addresses and email data
- **Financial_Data_Table**: PostgreSQL table storing income and employment information
- **Application_Data_Table**: PostgreSQL table storing application-specific data and metadata
- **Test_Scenarios_Table**: PostgreSQL table storing test scenario metadata and expected outcomes
- **Seeding_System**: Automated process for populating all database tables with test data from mock scenarios
- **Mock_Test_Data**: JSON file containing predefined test scenarios with complete applicant data
- **Database_Environment**: Docker-managed PostgreSQL instance with environment-specific database names
- **Docker_Compose_Environment**: Container orchestration managing database separation through compose files
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

**User Story:** As a developer, I want to target specific database environments through Docker Compose, so that I can safely manage test data without affecting production systems.

#### Acceptance Criteria

1. THE Seeding_System SHALL use a single DATABASE_URL connection string from environment variables
2. THE Docker_Compose_Environment SHALL manage database separation through different POSTGRES_DB names
3. WHEN running in development mode, THE Seeding_System SHALL connect to the database specified in docker-compose.dev.yml
4. THE Seeding_System SHALL validate database name to prevent accidental seeding of production databases with test data
5. THE Seeding_System SHALL provide a reset operation that cleans and repopulates test data in one command

### Requirement 5

**User Story:** As a system administrator, I want Docker Compose to manage database environments through configuration, so that I can isolate test data from production data using a single PostgreSQL service.

#### Acceptance Criteria

1. THE Docker_Compose_Configuration SHALL use different POSTGRES_DB environment variables for development and production
2. THE Docker_Compose_Configuration SHALL maintain a single PostgreSQL service with environment-specific database names
3. THE Docker_Compose_Configuration SHALL use docker-compose.dev.yml for development with test database name
4. THE Docker_Compose_Configuration SHALL use docker-compose.yml for production with production database name
5. THE Seeding_System SHALL validate database connectivity and schema before proceeding with seeding operations

### Requirement 6

**User Story:** As a developer, I want simplified configuration management using Docker environment variables, so that I can easily work with different database environments without complex URL management.

#### Acceptance Criteria

1. THE Configuration_System SHALL use a single DATABASE_URL environment variable for all connections
2. THE Docker_Environment SHALL provide the appropriate database connection through POSTGRES_DB configuration
3. WHEN running seeding operations, THE Seeding_System SHALL validate the target database name matches expected environment
4. THE Seeding_System SHALL refuse to seed databases with production-like names using test scenario data
5. THE Configuration_System SHALL provide clear logging of which database name is being used for seeding

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