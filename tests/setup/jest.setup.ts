// Jest setup file for database seeding tests
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.SSN_SALT = process.env.SSN_SALT || 'test-ssn-salt-12345';
process.env.DOB_SALT = process.env.DOB_SALT || 'test-dob-salt-67890';

// Use the actual database from .env for testing (use the same database for now)
const baseUrl = process.env.DATABASE_URL || 'postgresql://dev_user:dev_password@localhost:5432/agents_app_dev';
process.env.TEST_DATABASE_URL = baseUrl; // Use same database for testing
process.env.DATABASE_URL = baseUrl;

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