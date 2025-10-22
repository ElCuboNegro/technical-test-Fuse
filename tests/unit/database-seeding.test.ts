/**
 * Database Seeding Unit Tests
 * Requirements addressed: 1.4, 1.5, 7.6
 * 
 * Unit tests for database seeding components that don't require live database connection.
 * Tests focus on data processing, validation, and business logic.
 */

import { MockDataParser } from '../../src/database/seeding/parser';
import { IdentityHasher } from '../../src/database/seeding/hasher';
import { DatabaseValidator } from '../../src/database/seeding/validator';
import { TestScenario } from '../../src/database/interfaces';

describe('Database Seeding Unit Tests', () => {
  let parser: MockDataParser;
  let hasher: IdentityHasher;
  let testScenarios: TestScenario[];

  beforeAll(async () => {
    parser = new MockDataParser();
    hasher = new IdentityHasher();
    
    // Parse test scenarios
    testScenarios = await parser.parseTestScenarios();
  });

  describe('Mock Data Parser', () => {
    test('should parse all test scenarios from JSON file', async () => {
      expect(testScenarios).toBeDefined();
      expect(Array.isArray(testScenarios)).toBe(true);
      expect(testScenarios.length).toBeGreaterThan(0);
      
      // Verify expected scenarios are present
      const scenarioNames = testScenarios.map(s => s.scenario_name);
      expect(scenarioNames).toContain('successful_verification');
      expect(scenarioNames).toContain('identity_verification_failure');
      expect(scenarioNames).toContain('self_employed_applicant');
    });

    test('should validate scenario data structure', () => {
      testScenarios.forEach(scenario => {
        const isValid = parser.validateScenarioData(scenario);
        expect(isValid).toBe(true);
        
        // Verify required fields
        expect(scenario.scenario_name).toBeDefined();
        expect(scenario.description).toBeDefined();
        expect(scenario.expected_outcome).toBeDefined();
        expect(scenario.applicant_data).toBeDefined();
      });
    });

    test('should extract identity data correctly', () => {
      const successfulScenario = testScenarios.find(s => s.scenario_name === 'successful_verification');
      expect(successfulScenario).toBeDefined();
      
      const identityData = parser.extractIdentityData(successfulScenario!);
      expect(identityData.date_of_birth).toBeDefined();
      expect(identityData.ssn_last_four).toBeDefined();
      expect(identityData.date_of_birth).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(identityData.ssn_last_four).toMatch(/^\d{4}$/);
    });

    test('should handle identity verification failure scenarios', () => {
      const failureScenario = testScenarios.find(s => s.scenario_name === 'identity_verification_failure');
      expect(failureScenario).toBeDefined();
      
      const identityData = parser.extractIdentityData(failureScenario!);
      
      // Should use correct data for database seeding
      expect(identityData.date_of_birth).toBe(failureScenario!.applicant_data.correct_date_of_birth);
      expect(identityData.ssn_last_four).toBe(failureScenario!.applicant_data.correct_ssn_last_four);
    });

    test('should extract contact data correctly', () => {
      const scenarioWithAddress = testScenarios.find(s => 
        s.applicant_data.mailing_address || s.applicant_data.complete_address
      );
      expect(scenarioWithAddress).toBeDefined();
      
      const contactData = parser.extractContactData(scenarioWithAddress!);
      expect(contactData.street_address).toBeDefined();
      expect(contactData.city).toBeDefined();
      expect(contactData.state).toBeDefined();
      expect(contactData.zip_code).toBeDefined();
    });

    test('should extract financial data correctly', () => {
      const scenarioWithFinancial = testScenarios.find(s => 
        s.applicant_data.monthly_income !== undefined
      );
      expect(scenarioWithFinancial).toBeDefined();
      
      const financialData = parser.extractFinancialData(scenarioWithFinancial!);
      expect(financialData.monthly_income).toBeDefined();
      expect(typeof financialData.monthly_income).toBe('number');
      expect(financialData.employment_status).toBeDefined();
    });

    test('should handle self-employed scenarios', () => {
      const selfEmployedScenario = testScenarios.find(s => 
        s.applicant_data.employment_status === 'self_employed'
      );
      expect(selfEmployedScenario).toBeDefined();
      
      const financialData = parser.extractFinancialData(selfEmployedScenario!);
      expect(financialData.employment_status).toBe('self_employed');
      expect(financialData.job_tenure_months).toBeNull();
    });
  });

  describe('Identity Hasher', () => {
    test('should validate SSN format correctly', () => {
      expect(hasher.validateSsnFormat('1234')).toBe(true);
      expect(hasher.validateSsnFormat('0000')).toBe(true);
      expect(hasher.validateSsnFormat('9999')).toBe(true);
      
      // Invalid formats
      expect(hasher.validateSsnFormat('123')).toBe(false);
      expect(hasher.validateSsnFormat('12345')).toBe(false);
      expect(hasher.validateSsnFormat('abcd')).toBe(false);
      expect(hasher.validateSsnFormat('')).toBe(false);
    });

    test('should validate DOB format correctly', () => {
      expect(hasher.validateDobFormat('1985-03-15')).toBe(true);
      expect(hasher.validateDobFormat('2000-12-31')).toBe(true);
      expect(hasher.validateDobFormat('1990-01-01')).toBe(true);
      
      // Invalid formats
      expect(hasher.validateDobFormat('85-03-15')).toBe(false);
      expect(hasher.validateDobFormat('1985/03/15')).toBe(false);
      expect(hasher.validateDobFormat('1985-3-15')).toBe(false);
      expect(hasher.validateDobFormat('invalid-date')).toBe(false);
      expect(hasher.validateDobFormat('')).toBe(false);
    });

    test('should hash DOB consistently', () => {
      const dob = '1985-03-15';
      const hash1 = hasher.hashDateOfBirth(dob);
      const hash2 = hasher.hashDateOfBirth(dob);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex format
    });

    test('should hash SSN consistently', () => {
      const ssn = '7234';
      const hash1 = hasher.hashSsnLast4(ssn);
      const hash2 = hasher.hashSsnLast4(ssn);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex format
    });

    test('should create hashed identity correctly', () => {
      const identityData = {
        date_of_birth: '1985-03-15',
        ssn_last_four: '7234'
      };
      
      const hashedIdentity = hasher.createHashedIdentity(identityData, 'test_scenario');
      
      expect(hashedIdentity.dobHash).toBeDefined();
      expect(hashedIdentity.ssnLast4Hash).toBeDefined();
      expect(hashedIdentity.externalReference).toBe('test_scenario');
      expect(hashedIdentity.dobHash).toMatch(/^[a-f0-9]{64}$/);
      expect(hashedIdentity.ssnLast4Hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should validate identity data before hashing', () => {
      const validIdentity = {
        date_of_birth: '1985-03-15',
        ssn_last_four: '7234'
      };
      
      const validation = hasher.validateIdentityData(validIdentity);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      
      const invalidIdentity = {
        date_of_birth: 'invalid-date',
        ssn_last_four: '123'
      };
      
      const invalidValidation = hasher.validateIdentityData(invalidIdentity);
      expect(invalidValidation.isValid).toBe(false);
      expect(invalidValidation.errors.length).toBeGreaterThan(0);
    });

    test('should handle batch hashing', () => {
      const identities = testScenarios.slice(0, 3).map(scenario => ({
        identity: parser.extractIdentityData(scenario),
        externalRef: scenario.scenario_name
      }));
      
      const hashedIdentities = hasher.createHashedIdentities(identities);
      
      expect(hashedIdentities).toHaveLength(3);
      hashedIdentities.forEach(hashed => {
        expect(hashed.dobHash).toMatch(/^[a-f0-9]{64}$/);
        expect(hashed.ssnLast4Hash).toMatch(/^[a-f0-9]{64}$/);
        expect(hashed.externalReference).toBeDefined();
      });
    });

    test('should verify hashed identity matches original', () => {
      const identityData = {
        date_of_birth: '1985-03-15',
        ssn_last_four: '7234'
      };
      
      const hashedIdentity = hasher.createHashedIdentity(identityData, 'test');
      const isValid = hasher.verifyHashedIdentity(identityData, hashedIdentity);
      
      expect(isValid).toBe(true);
      
      // Test with different data
      const differentIdentity = {
        date_of_birth: '1990-01-01',
        ssn_last_four: '9999'
      };
      
      const isInvalid = hasher.verifyHashedIdentity(differentIdentity, hashedIdentity);
      expect(isInvalid).toBe(false);
    });
  });

  describe('Database Validator', () => {
    test('should create validator instance', () => {
      const testUrl = 'postgresql://test:test@localhost:5433/test_db';
      const validator = new DatabaseValidator(testUrl);
      
      expect(validator).toBeDefined();
    });

    test('should handle connection validation gracefully', async () => {
      const testUrl = 'postgresql://invalid:invalid@nonexistent:5432/invalid_db';
      const validator = new DatabaseValidator(testUrl);
      
      // Should not throw, just return false
      const isValid = await validator.validateConnection(testUrl);
      expect(typeof isValid).toBe('boolean');
      
      await validator.close();
    });
  });

  describe('Data Processing Logic', () => {
    test('should process all scenario types without errors', () => {
      const scenarioTypes = [
        'successful_verification',
        'identity_verification_failure',
        'self_employed_applicant',
        'job_tenure_discrepancy',
        'no_email_provided',
        'address_with_unit_clarification',
        'recent_job_change',
        'partial_identity_failure_then_success'
      ];
      
      scenarioTypes.forEach(scenarioName => {
        const scenario = testScenarios.find(s => s.scenario_name === scenarioName);
        if (scenario) {
          // Should be able to extract identity data
          expect(() => parser.extractIdentityData(scenario)).not.toThrow();
          
          // Should be able to validate scenario
          expect(parser.validateScenarioData(scenario)).toBe(true);
          
          // Should be able to extract financial data if present
          if (scenario.applicant_data.monthly_income !== undefined) {
            expect(() => parser.extractFinancialData(scenario)).not.toThrow();
          }
          
          // Should be able to extract contact data if present
          if (scenario.applicant_data.mailing_address || scenario.applicant_data.complete_address) {
            expect(() => parser.extractContactData(scenario)).not.toThrow();
          }
        }
      });
    });

    test('should handle edge cases in data extraction', () => {
      // Test scenario with null email
      const noEmailScenario = testScenarios.find(s => s.applicant_data.email === null);
      if (noEmailScenario) {
        const contactData = parser.extractContactData(noEmailScenario);
        expect(contactData.email).toBeNull();
      }
      
      // Test self-employed scenario with null job tenure
      const selfEmployedScenario = testScenarios.find(s => s.applicant_data.employment_status === 'self_employed');
      if (selfEmployedScenario) {
        const financialData = parser.extractFinancialData(selfEmployedScenario);
        expect(financialData.employment_status).toBe('self_employed');
        expect(financialData.job_tenure_months).toBeNull();
      }
      
      // Test scenario with unit number
      const unitScenario = testScenarios.find(s => 
        s.applicant_data.mailing_address?.unit || s.applicant_data.complete_address?.unit
      );
      if (unitScenario) {
        const contactData = parser.extractContactData(unitScenario);
        expect(contactData.unit_number).toBeDefined();
      }
    });

    test('should maintain data consistency across extractions', () => {
      testScenarios.forEach(scenario => {
        const identityData = parser.extractIdentityData(scenario);
        
        // Identity data should be consistent
        expect(identityData.date_of_birth).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(identityData.ssn_last_four).toMatch(/^\d{4}$/);
        
        // Should be able to hash the identity data
        const hashedIdentity = hasher.createHashedIdentity(identityData, scenario.scenario_name);
        expect(hashedIdentity.externalReference).toBe(scenario.scenario_name);
        
        // Verification should work
        const isValid = hasher.verifyHashedIdentity(identityData, hashedIdentity);
        expect(isValid).toBe(true);
      });
    });
  });

  describe('Upsert Logic Validation', () => {
    test('should generate consistent external references', () => {
      const externalRefs = testScenarios.map(s => s.scenario_name);
      
      // Should have unique external references
      const uniqueRefs = new Set(externalRefs);
      expect(uniqueRefs.size).toBe(externalRefs.length);
      
      // Should be valid identifiers
      externalRefs.forEach(ref => {
        expect(ref).toBeDefined();
        expect(typeof ref).toBe('string');
        expect(ref.length).toBeGreaterThan(0);
      });
    });

    test('should support idempotent operations', () => {
      // Multiple extractions should yield same results
      const scenario = testScenarios[0];
      
      const identity1 = parser.extractIdentityData(scenario);
      const identity2 = parser.extractIdentityData(scenario);
      
      expect(identity1).toEqual(identity2);
      
      const hash1 = hasher.createHashedIdentity(identity1, scenario.scenario_name);
      const hash2 = hasher.createHashedIdentity(identity2, scenario.scenario_name);
      
      expect(hash1).toEqual(hash2);
    });
  });

  describe('Foreign Key Relationship Validation', () => {
    test('should maintain consistent external references across data types', () => {
      testScenarios.forEach(scenario => {
        const externalRef = scenario.scenario_name;
        
        // Identity data should use same external reference
        const identityData = parser.extractIdentityData(scenario);
        const hashedIdentity = hasher.createHashedIdentity(identityData, externalRef);
        expect(hashedIdentity.externalReference).toBe(externalRef);
        
        // Contact data should reference same external reference
        if (scenario.applicant_data.mailing_address || scenario.applicant_data.complete_address) {
          const contactData = parser.extractContactData(scenario);
          // External reference would be added during seeding
          expect(contactData).toBeDefined();
        }
        
        // Financial data should reference same external reference
        if (scenario.applicant_data.monthly_income !== undefined) {
          const financialData = parser.extractFinancialData(scenario);
          // External reference would be added during seeding
          expect(financialData).toBeDefined();
        }
      });
    });

    test('should validate data integrity requirements', () => {
      // Every scenario should have identity data (required for foreign keys)
      testScenarios.forEach(scenario => {
        const identityData = parser.extractIdentityData(scenario);
        expect(identityData.date_of_birth).toBeDefined();
        expect(identityData.ssn_last_four).toBeDefined();
        
        // Should be valid for hashing
        const validation = hasher.validateIdentityData(identityData);
        expect(validation.isValid).toBe(true);
      });
    });
  });
});