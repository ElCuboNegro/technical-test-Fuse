import { readFileSync } from 'fs';
import { join } from 'path';
import { 
  MockDataParser as IMockDataParser,
  TestScenario,
  MockTestData,
  IdentityData,
  ContactData,
  FinancialData
} from '../interfaces/index';

/**
 * MockDataParser handles parsing and validation of test scenarios from JSON file
 * Requirements addressed: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */
export class MockDataParser implements IMockDataParser {
  private mockDataPath: string;
  private mockData: MockTestData | null = null;

  constructor(mockDataPath?: string) {
    this.mockDataPath = mockDataPath || join(process.cwd(), 'tests', 'mock_test_data.json');
  }

  /**
   * Parse test scenarios from JSON file
   */
  async parseTestScenarios(): Promise<TestScenario[]> {
    try {
      if (!this.mockData) {
        const fileContent = readFileSync(this.mockDataPath, 'utf-8');
        this.mockData = JSON.parse(fileContent);
      }

      if (!this.mockData || !this.mockData.test_scenarios) {
        throw new Error('Invalid mock data structure: missing test_scenarios');
      }

      // Validate each scenario
      const validScenarios: TestScenario[] = [];
      for (const scenario of this.mockData.test_scenarios) {
        if (this.validateScenarioData(scenario)) {
          validScenarios.push(scenario);
        } else {
          console.warn(`Skipping invalid scenario: ${scenario.scenario_name}`);
        }
      }

      console.log(`✓ Parsed ${validScenarios.length} valid test scenarios`);
      return validScenarios;

    } catch (error) {
      throw new Error(`Failed to parse test scenarios: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate scenario data structure
   */
  validateScenarioData(scenario: TestScenario): boolean {
    try {
      // Required fields
      if (!scenario.scenario_name || !scenario.description || !scenario.expected_outcome) {
        return false;
      }

      if (!scenario.applicant_data) {
        return false;
      }

      // For identity verification failure scenarios, we need correct data
      if (scenario.scenario_name === 'identity_verification_failure') {
        return !!(scenario.applicant_data.correct_date_of_birth && scenario.applicant_data.correct_ssn_last_four);
      }

      // For standard scenarios, we need basic identity data
      return !!(scenario.applicant_data.date_of_birth && scenario.applicant_data.ssn_last_four);

    } catch (error) {
      console.error(`Validation error for scenario ${scenario?.scenario_name || 'unknown'}:`, error);
      return false;
    }
  }

  /**
   * Extract identity data from scenario
   */
  extractIdentityData(scenario: TestScenario): IdentityData {
    const applicant = scenario.applicant_data;

    // For identity verification failure scenarios, use correct data for database seeding
    if (scenario.scenario_name === 'identity_verification_failure') {
      return {
        date_of_birth: applicant.correct_date_of_birth!,
        ssn_last_four: applicant.correct_ssn_last_four!,
        correct_date_of_birth: applicant.correct_date_of_birth,
        correct_ssn_last_four: applicant.correct_ssn_last_four
      };
    }

    // For partial failure scenarios, use the correct data
    if (scenario.scenario_name === 'partial_identity_failure_then_success') {
      return {
        date_of_birth: applicant.date_of_birth!,
        ssn_last_four: applicant.ssn_last_four!
      };
    }

    // Standard scenarios
    return {
      date_of_birth: applicant.date_of_birth!,
      ssn_last_four: applicant.ssn_last_four!
    };
  }

  /**
   * Extract contact data from scenario
   */
  extractContactData(scenario: TestScenario): ContactData {
    const applicant = scenario.applicant_data;

    // Handle scenarios with complete_address (like address_with_unit_clarification)
    if (applicant.complete_address) {
      return {
        street_address: applicant.complete_address.street,
        unit_number: applicant.complete_address.unit,
        city: applicant.complete_address.city,
        state: applicant.complete_address.state,
        zip_code: applicant.complete_address.zip_code,
        email: applicant.email
      };
    }

    // Standard mailing address
    if (applicant.mailing_address) {
      return {
        street_address: applicant.mailing_address.street,
        unit_number: applicant.mailing_address.unit,
        city: applicant.mailing_address.city,
        state: applicant.mailing_address.state,
        zip_code: applicant.mailing_address.zip_code,
        email: applicant.email
      };
    }

    // Fallback for scenarios without address data
    throw new Error(`No address data found for scenario: ${scenario.scenario_name}`);
  }

  /**
   * Extract financial data from scenario
   */
  extractFinancialData(scenario: TestScenario): FinancialData {
    const applicant = scenario.applicant_data;

    return {
      monthly_income: applicant.monthly_income || 0,
      job_tenure_months: applicant.job_tenure_months,
      employment_status: applicant.employment_status || 'employed',
      application_job_tenure: applicant.application_job_tenure,
      job_change_reason: applicant.job_change_reason
    };
  }

  /**
   * Get system variables from mock data
   */
  getSystemVariables(): any {
    if (!this.mockData) {
      throw new Error('Mock data not loaded. Call parseTestScenarios() first.');
    }
    return this.mockData.system_variables;
  }

  /**
   * Get response templates from mock data
   */
  getResponseTemplates(): Record<string, string> {
    if (!this.mockData) {
      throw new Error('Mock data not loaded. Call parseTestScenarios() first.');
    }
    return this.mockData.response_templates;
  }

  /**
   * Get scenario by name
   */
  getScenarioByName(scenarioName: string): TestScenario | null {
    if (!this.mockData) {
      return null;
    }
    return this.mockData.test_scenarios.find(s => s.scenario_name === scenarioName) || null;
  }

  /**
   * Get scenarios by type
   */
  getScenariosByType(expectedOutcome: string): TestScenario[] {
    if (!this.mockData) {
      return [];
    }
    return this.mockData.test_scenarios.filter(s => s.expected_outcome === expectedOutcome);
  }
}