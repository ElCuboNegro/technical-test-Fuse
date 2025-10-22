import { MockDataParser } from '../parser';
import { TestScenario } from '../../interfaces/index';
import { readFileSync } from 'fs';
import { join } from 'path';

// Mock fs module
jest.mock('fs');
const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;

describe('MockDataParser', () => {
  let parser: MockDataParser;
  
  const mockTestData = {
    test_scenarios: [
      {
        scenario_name: 'successful_verification',
        description: 'Standard successful flow with employed applicant',
        applicant_data: {
          name: 'Michael Thompson',
          date_of_birth: '1985-03-15',
          ssn_last_four: '7234',
          mailing_address: {
            street: '1247 Oak Street',
            unit: 'Unit 3B',
            city: 'Denver',
            state: 'Colorado',
            zip_code: '80202'
          },
          email: 'mthompson.denver@gmail.com',
          monthly_income: 6500,
          job_tenure_months: 42,
          application_job_tenure: 36
        },
        expected_flow: ['identity_verification', 'contact_information', 'employment_verification', 'final_confirmation'],
        expected_outcome: 'success'
      },
      {
        scenario_name: 'identity_verification_failure',
        description: 'Wrong SSN and DOB provided multiple times',
        applicant_data: {
          name: 'Jennifer Martinez',
          correct_date_of_birth: '1990-06-22',
          correct_ssn_last_four: '3891',
          provided_date_of_birth: '1991-06-22',
          provided_ssn_last_four: '8492'
        },
        expected_flow: ['identity_verification'],
        expected_outcome: 'failure',
        failure_reason: 'identity_verification_failed'
      },
      {
        scenario_name: 'self_employed_applicant',
        description: 'Self-employed applicant with variable income',
        applicant_data: {
          name: 'Lisa Chen',
          date_of_birth: '1982-08-08',
          ssn_last_four: '5639',
          mailing_address: {
            street: '892 Sunset Boulevard',
            unit: null,
            city: 'Los Angeles',
            state: 'California',
            zip_code: '90210'
          },
          email: 'lisa.design@freelancer.com',
          monthly_income: 7200,
          employment_status: 'self_employed',
          job_tenure_months: null
        },
        expected_flow: ['identity_verification', 'contact_information', 'employment_verification', 'final_confirmation'],
        expected_outcome: 'success'
      },
      {
        scenario_name: 'address_with_unit_clarification',
        description: 'User initially forgets unit number',
        applicant_data: {
          name: 'Carlos Rodriguez',
          date_of_birth: '1992-09-18',
          ssn_last_four: '4521',
          initial_address: '2580 Broadway Street, New York, New York, 10025',
          complete_address: {
            street: '2580 Broadway Street',
            unit: 'Apartment 15F',
            city: 'New York',
            state: 'New York',
            zip_code: '10025'
          },
          email: 'carlos.rodriguez.ny@gmail.com',
          monthly_income: 5800,
          job_tenure_months: 24
        },
        expected_flow: ['identity_verification', 'contact_information', 'employment_verification', 'final_confirmation'],
        expected_outcome: 'success'
      },
      {
        scenario_name: 'partial_identity_failure_then_success',
        description: 'User provides wrong info first, then corrects it',
        applicant_data: {
          name: 'Kevin Park',
          date_of_birth: '1975-07-25',
          ssn_last_four: '1357',
          first_attempt: {
            date_of_birth: '1975-07-26',
            ssn_last_four: '1357'
          },
          second_attempt: {
            date_of_birth: '1975-07-25',
            ssn_last_four: '1357'
          },
          mailing_address: {
            street: '654 Highland Drive',
            unit: null,
            city: 'Nashville',
            state: 'Tennessee',
            zip_code: '37201'
          },
          email: 'kpark.music@gmail.com',
          monthly_income: 6200,
          job_tenure_months: 96
        },
        expected_flow: ['identity_verification', 'contact_information', 'employment_verification', 'final_confirmation'],
        expected_outcome: 'success'
      }
    ],
    system_variables: {
      job_tenure_threshold_months: 15,
      max_identity_attempts: 2,
      required_fields: ['name', 'date_of_birth', 'ssn_last_four', 'mailing_address', 'monthly_income'],
      optional_fields: ['email', 'unit_number']
    },
    response_templates: {
      identity_failure: 'I understand this can be frustrating...',
      job_tenure_discrepancy: 'I show on your application...'
    }
  };

  beforeEach(() => {
    mockReadFileSync.mockReturnValue(JSON.stringify(mockTestData));
    parser = new MockDataParser();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('parseTestScenarios', () => {
    it('should parse valid test scenarios successfully', async () => {
      const scenarios = await parser.parseTestScenarios();

      expect(scenarios).toHaveLength(5);
      expect(scenarios[0].scenario_name).toBe('successful_verification');
      expect(scenarios[1].scenario_name).toBe('identity_verification_failure');
      expect(scenarios[2].scenario_name).toBe('self_employed_applicant');
    });

    it('should validate all required fields are present', async () => {
      const scenarios = await parser.parseTestScenarios();

      scenarios.forEach(scenario => {
        expect(scenario.scenario_name).toBeDefined();
        expect(scenario.description).toBeDefined();
        expect(scenario.expected_outcome).toBeDefined();
        expect(scenario.applicant_data).toBeDefined();
      });
    });

    it('should handle missing test_scenarios gracefully', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ invalid: 'data' }));

      await expect(parser.parseTestScenarios())
        .rejects.toThrow('Invalid mock data structure: missing test_scenarios');
    });

    it('should handle malformed JSON', async () => {
      mockReadFileSync.mockReturnValue('invalid json');

      await expect(parser.parseTestScenarios())
        .rejects.toThrow('Failed to parse test scenarios:');
    });

    it('should handle file read errors', async () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      await expect(parser.parseTestScenarios())
        .rejects.toThrow('Failed to parse test scenarios: File not found');
    });

    it('should skip invalid scenarios and warn', async () => {
      const invalidData = {
        test_scenarios: [
          {
            scenario_name: 'valid_scenario',
            description: 'Valid scenario',
            applicant_data: {
              name: 'Test User',
              date_of_birth: '1985-01-01',
              ssn_last_four: '1234'
            },
            expected_outcome: 'success'
          },
          {
            scenario_name: 'invalid_scenario',
            // Missing required fields
            applicant_data: {}
          }
        ]
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(invalidData));
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const scenarios = await parser.parseTestScenarios();

      expect(scenarios).toHaveLength(1);
      expect(scenarios[0].scenario_name).toBe('valid_scenario');
      expect(consoleSpy).toHaveBeenCalledWith('Skipping invalid scenario: invalid_scenario');

      consoleSpy.mockRestore();
    });
  });

  describe('validateScenarioData', () => {
    it('should validate successful verification scenario', () => {
      const scenario = mockTestData.test_scenarios[0] as TestScenario;
      const isValid = parser.validateScenarioData(scenario);

      expect(isValid).toBe(true);
    });

    it('should validate identity verification failure scenario', () => {
      const scenario = mockTestData.test_scenarios[1] as TestScenario;
      const isValid = parser.validateScenarioData(scenario);

      expect(isValid).toBe(true);
    });

    it('should reject scenario with missing required fields', () => {
      const invalidScenario = {
        scenario_name: 'test',
        // Missing description, expected_outcome, applicant_data
      } as TestScenario;

      const isValid = parser.validateScenarioData(invalidScenario);

      expect(isValid).toBe(false);
    });

    it('should reject scenario with missing applicant_data', () => {
      const invalidScenario = {
        scenario_name: 'test',
        description: 'Test scenario',
        expected_outcome: 'success'
        // Missing applicant_data
      } as TestScenario;

      const isValid = parser.validateScenarioData(invalidScenario);

      expect(isValid).toBe(false);
    });

    it('should reject identity_verification_failure without correct data', () => {
      const invalidScenario = {
        scenario_name: 'identity_verification_failure',
        description: 'Test scenario',
        expected_outcome: 'failure',
        applicant_data: {
          name: 'Test User'
          // Missing correct_date_of_birth and correct_ssn_last_four
        }
      } as TestScenario;

      const isValid = parser.validateScenarioData(invalidScenario);

      expect(isValid).toBe(false);
    });

    it('should reject standard scenario without basic identity data', () => {
      const invalidScenario = {
        scenario_name: 'standard_scenario',
        description: 'Test scenario',
        expected_outcome: 'success',
        applicant_data: {
          name: 'Test User'
          // Missing date_of_birth and ssn_last_four
        }
      } as TestScenario;

      const isValid = parser.validateScenarioData(invalidScenario);

      expect(isValid).toBe(false);
    });

    it('should handle validation errors gracefully', () => {
      const invalidScenario = null as any;
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const isValid = parser.validateScenarioData(invalidScenario);

      expect(isValid).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('extractIdentityData', () => {
    it('should extract identity data from successful verification scenario', () => {
      const scenario = mockTestData.test_scenarios[0] as TestScenario;
      const identity = parser.extractIdentityData(scenario);

      expect(identity.date_of_birth).toBe('1985-03-15');
      expect(identity.ssn_last_four).toBe('7234');
    });

    it('should extract correct data for identity_verification_failure scenario', () => {
      const scenario = mockTestData.test_scenarios[1] as TestScenario;
      const identity = parser.extractIdentityData(scenario);

      expect(identity.date_of_birth).toBe('1990-06-22');
      expect(identity.ssn_last_four).toBe('3891');
      expect(identity.correct_date_of_birth).toBe('1990-06-22');
      expect(identity.correct_ssn_last_four).toBe('3891');
    });

    it('should extract data for partial_identity_failure_then_success scenario', () => {
      const scenario = mockTestData.test_scenarios[4] as TestScenario;
      const identity = parser.extractIdentityData(scenario);

      expect(identity.date_of_birth).toBe('1975-07-25');
      expect(identity.ssn_last_four).toBe('1357');
    });
  });

  describe('extractContactData', () => {
    it('should extract contact data with mailing address', () => {
      const scenario = mockTestData.test_scenarios[0] as TestScenario;
      const contact = parser.extractContactData(scenario);

      expect(contact.street_address).toBe('1247 Oak Street');
      expect(contact.unit_number).toBe('Unit 3B');
      expect(contact.city).toBe('Denver');
      expect(contact.state).toBe('Colorado');
      expect(contact.zip_code).toBe('80202');
      expect(contact.email).toBe('mthompson.denver@gmail.com');
    });

    it('should extract contact data with complete address', () => {
      const scenario = mockTestData.test_scenarios[3] as TestScenario;
      const contact = parser.extractContactData(scenario);

      expect(contact.street_address).toBe('2580 Broadway Street');
      expect(contact.unit_number).toBe('Apartment 15F');
      expect(contact.city).toBe('New York');
      expect(contact.state).toBe('New York');
      expect(contact.zip_code).toBe('10025');
      expect(contact.email).toBe('carlos.rodriguez.ny@gmail.com');
    });

    it('should handle null unit number', () => {
      const scenario = mockTestData.test_scenarios[2] as TestScenario;
      const contact = parser.extractContactData(scenario);

      expect(contact.street_address).toBe('892 Sunset Boulevard');
      expect(contact.unit_number).toBeNull();
      expect(contact.city).toBe('Los Angeles');
      expect(contact.state).toBe('California');
      expect(contact.zip_code).toBe('90210');
      expect(contact.email).toBe('lisa.design@freelancer.com');
    });

    it('should throw error for scenario without address data', () => {
      const scenarioWithoutAddress = {
        scenario_name: 'no_address',
        description: 'Test',
        applicant_data: {
          name: 'Test User',
          email: 'test@example.com'
        },
        expected_outcome: 'success'
      } as TestScenario;

      expect(() => parser.extractContactData(scenarioWithoutAddress))
        .toThrow('No address data found for scenario: no_address');
    });
  });

  describe('extractFinancialData', () => {
    it('should extract financial data with all fields', () => {
      const scenario = mockTestData.test_scenarios[0] as TestScenario;
      const financial = parser.extractFinancialData(scenario);

      expect(financial.monthly_income).toBe(6500);
      expect(financial.job_tenure_months).toBe(42);
      expect(financial.employment_status).toBe('employed');
      expect(financial.application_job_tenure).toBe(36);
    });

    it('should handle self-employed applicant', () => {
      const scenario = mockTestData.test_scenarios[2] as TestScenario;
      const financial = parser.extractFinancialData(scenario);

      expect(financial.monthly_income).toBe(7200);
      expect(financial.job_tenure_months).toBeNull();
      expect(financial.employment_status).toBe('self_employed');
    });

    it('should handle missing optional fields', () => {
      const scenarioWithMinimalData = {
        scenario_name: 'minimal',
        description: 'Test',
        applicant_data: {
          name: 'Test User',
          monthly_income: 5000
        },
        expected_outcome: 'success'
      } as TestScenario;

      const financial = parser.extractFinancialData(scenarioWithMinimalData);

      expect(financial.monthly_income).toBe(5000);
      expect(financial.job_tenure_months).toBeUndefined();
      expect(financial.employment_status).toBe('employed');
      expect(financial.application_job_tenure).toBeUndefined();
    });

    it('should default to 0 for missing monthly_income', () => {
      const scenarioWithoutIncome = {
        scenario_name: 'no_income',
        description: 'Test',
        applicant_data: {
          name: 'Test User'
        },
        expected_outcome: 'success'
      } as TestScenario;

      const financial = parser.extractFinancialData(scenarioWithoutIncome);

      expect(financial.monthly_income).toBe(0);
      expect(financial.employment_status).toBe('employed');
    });
  });

  describe('getSystemVariables', () => {
    it('should return system variables after parsing', async () => {
      await parser.parseTestScenarios();
      const systemVars = parser.getSystemVariables();

      expect(systemVars.job_tenure_threshold_months).toBe(15);
      expect(systemVars.max_identity_attempts).toBe(2);
      expect(systemVars.required_fields).toContain('name');
      expect(systemVars.optional_fields).toContain('email');
    });

    it('should throw error if called before parsing', () => {
      expect(() => parser.getSystemVariables())
        .toThrow('Mock data not loaded. Call parseTestScenarios() first.');
    });
  });

  describe('getResponseTemplates', () => {
    it('should return response templates after parsing', async () => {
      await parser.parseTestScenarios();
      const templates = parser.getResponseTemplates();

      expect(templates.identity_failure).toBeDefined();
      expect(templates.job_tenure_discrepancy).toBeDefined();
    });

    it('should throw error if called before parsing', () => {
      expect(() => parser.getResponseTemplates())
        .toThrow('Mock data not loaded. Call parseTestScenarios() first.');
    });
  });

  describe('getScenarioByName', () => {
    it('should return scenario by name after parsing', async () => {
      await parser.parseTestScenarios();
      const scenario = parser.getScenarioByName('successful_verification');

      expect(scenario).toBeDefined();
      expect(scenario!.scenario_name).toBe('successful_verification');
    });

    it('should return null for non-existent scenario', async () => {
      await parser.parseTestScenarios();
      const scenario = parser.getScenarioByName('non_existent');

      expect(scenario).toBeNull();
    });

    it('should return null if called before parsing', () => {
      const scenario = parser.getScenarioByName('test');

      expect(scenario).toBeNull();
    });
  });

  describe('getScenariosByType', () => {
    it('should return scenarios by expected outcome', async () => {
      await parser.parseTestScenarios();
      const successScenarios = parser.getScenariosByType('success');

      expect(successScenarios.length).toBeGreaterThan(0);
      successScenarios.forEach(scenario => {
        expect(scenario.expected_outcome).toBe('success');
      });
    });

    it('should return failure scenarios', async () => {
      await parser.parseTestScenarios();
      const failureScenarios = parser.getScenariosByType('failure');

      expect(failureScenarios.length).toBe(1);
      expect(failureScenarios[0].scenario_name).toBe('identity_verification_failure');
    });

    it('should return empty array for non-existent type', async () => {
      await parser.parseTestScenarios();
      const scenarios = parser.getScenariosByType('non_existent');

      expect(scenarios).toHaveLength(0);
    });

    it('should return empty array if called before parsing', () => {
      const scenarios = parser.getScenariosByType('success');

      expect(scenarios).toHaveLength(0);
    });
  });

  describe('data sanitization and format conversion', () => {
    it('should handle various email formats', () => {
      const testScenarios = [
        { email: 'test@example.com', expected: 'test@example.com' },
        { email: 'Test@Example.COM', expected: 'Test@Example.COM' }, // Parser doesn't normalize case
        { email: null, expected: null },
        { email: undefined, expected: undefined }
      ];

      testScenarios.forEach(({ email, expected }) => {
        const scenario = {
          scenario_name: 'test',
          description: 'Test',
          applicant_data: {
            name: 'Test User',
            date_of_birth: '1985-01-01',
            ssn_last_four: '1234',
            mailing_address: {
              street: '123 Test St',
              city: 'Test City',
              state: 'TS',
              zip_code: '12345'
            },
            email
          },
          expected_outcome: 'success'
        } as TestScenario;

        const contact = parser.extractContactData(scenario);
        expect(contact.email).toBe(expected);
      });
    });

    it('should handle various income formats', () => {
      const testScenarios = [
        { income: 5000, expected: 5000 },
        { income: 0, expected: 0 },
        { income: undefined, expected: 0 },
        { income: null, expected: 0 }
      ];

      testScenarios.forEach(({ income, expected }) => {
        const scenario = {
          scenario_name: 'test',
          description: 'Test',
          applicant_data: {
            name: 'Test User',
            monthly_income: income
          },
          expected_outcome: 'success'
        } as TestScenario;

        const financial = parser.extractFinancialData(scenario);
        expect(financial.monthly_income).toBe(expected);
      });
    });

    it('should handle nullable fields correctly', () => {
      const scenario = {
        scenario_name: 'nullable_test',
        description: 'Test nullable fields',
        applicant_data: {
          name: 'Test User',
          date_of_birth: '1985-01-01',
          ssn_last_four: '1234',
          mailing_address: {
            street: '123 Test St',
            unit: null,
            city: 'Test City',
            state: 'TS',
            zip_code: '12345'
          },
          email: null,
          monthly_income: 5000,
          job_tenure_months: null,
          employment_status: 'self_employed'
        },
        expected_outcome: 'success'
      } as TestScenario;

      const contact = parser.extractContactData(scenario);
      const financial = parser.extractFinancialData(scenario);

      expect(contact.unit_number).toBeNull();
      expect(contact.email).toBeNull();
      expect(financial.job_tenure_months).toBeNull();
    });
  });
});