// Jest setup file for database seeding tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.SSN_SALT = 'test-ssn-salt-12345';
process.env.DOB_SALT = 'test-dob-salt-67890';
process.env.TEST_DATABASE_URL = 'postgresql://test:test@localhost:5433/agents_app_test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/agents_app_prod';

// Global test timeout
jest.setTimeout(10000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};