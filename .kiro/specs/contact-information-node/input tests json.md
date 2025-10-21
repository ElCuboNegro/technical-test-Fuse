{
  "test_scenarios": [
    {
      "scenario_name": "successful_verification",
      "description": "Standard successful flow with employed applicant",
      "applicant_data": {
        "name": "Michael Thompson",
        "date_of_birth": "1985-03-15",
        "ssn_last_four": "7234",
        "mailing_address": {
          "street": "1247 Oak Street",
          "unit": "Unit 3B",
          "city": "Denver",
          "state": "Colorado",
          "zip_code": "80202"
        },
        "email": "mthompson.denver@gmail.com",
        "monthly_income": 6500,
        "job_tenure_months": 42,
        "application_job_tenure": 36
      },
      "expected_flow": ["identity_verification", "contact_information", "employment_verification", "final_confirmation"],
      "expected_outcome": "success"
    },
    {
      "scenario_name": "self_employed_applicant",
      "description": "Self-employed applicant with variable income",
      "applicant_data": {
        "name": "Lisa Chen",
        "date_of_birth": "1982-08-08",
        "ssn_last_four": "5639",
        "mailing_address": {
          "street": "892 Sunset Boulevard",
          "unit": null,
          "city": "Los Angeles",
          "state": "California",
          "zip_code": "90210"
        },
        "email": "lisa.design@freelancer.com",
        "monthly_income": 7200,
        "employment_status": "self_employed",
        "job_tenure_months": null
      },
      "expected_flow": ["identity_verification", "contact_information", "employment_verification", "final_confirmation"],
      "expected_outcome": "success"
    },
    {
      "scenario_name": "identity_verification_failure",
      "description": "Wrong SSN and DOB provided multiple times",
      "applicant_data": {
        "name": "Jennifer Martinez",
        "correct_date_of_birth": "1990-06-22",
        "correct_ssn_last_four": "3891",
        "provided_date_of_birth": "1991-06-22",
        "provided_ssn_last_four": "8492"
      },
      "expected_flow": ["identity_verification"],
      "expected_outcome": "failure",
      "failure_reason": "identity_verification_failed"
    },
    {
      "scenario_name": "job_tenure_discrepancy",
      "description": "Significant difference between stated and application tenure",
      "applicant_data": {
        "name": "Robert Johnson",
        "date_of_birth": "1978-11-30",
        "ssn_last_four": "9156",
        "mailing_address": {
          "street": "456 Pine Avenue",
          "unit": "Apt 12",
          "city": "Seattle",
          "state": "Washington",
          "zip_code": "98101"
        },
        "email": "rjohnson@techcorp.com",
        "monthly_income": 8500,
        "job_tenure_months": 8,
        "application_job_tenure": 60
      },
      "expected_flow": ["identity_verification", "contact_information", "employment_verification", "final_confirmation"],
      "expected_outcome": "success_with_clarification"
    },
    {
      "scenario_name": "no_email_provided",
      "description": "Applicant doesn't have email address",
      "applicant_data": {
        "name": "Dorothy Wilson",
        "date_of_birth": "1955-04-12",
        "ssn_last_four": "2847",
        "mailing_address": {
          "street": "789 Maple Street",
          "unit": null,
          "city": "Phoenix",
          "state": "Arizona",
          "zip_code": "85001"
        },
        "email": null,
        "monthly_income": 3200,
        "job_tenure_months": 180
      },
      "expected_flow": ["identity_verification", "contact_information", "employment_verification", "final_confirmation"],
      "expected_outcome": "success"
    },
    {
      "scenario_name": "address_with_unit_clarification",
      "description": "User initially forgets unit number",
      "applicant_data": {
        "name": "Carlos Rodriguez",
        "date_of_birth": "1992-09-18",
        "ssn_last_four": "4521",
        "initial_address": "2580 Broadway Street, New York, New York, 10025",
        "complete_address": {
          "street": "2580 Broadway Street",
          "unit": "Apartment 15F",
          "city": "New York",
          "state": "New York",
          "zip_code": "10025"
        },
        "email": "carlos.rodriguez.ny@gmail.com",
        "monthly_income": 5800,
        "job_tenure_months": 24
      },
      "expected_flow": ["identity_verification", "contact_information", "employment_verification", "final_confirmation"],
      "expected_outcome": "success"
    },
    {
      "scenario_name": "recent_job_change",
      "description": "Applicant changed jobs recently, under tenure threshold",
      "applicant_data": {
        "name": "Amanda Foster",
        "date_of_birth": "1988-12-03",
        "ssn_last_four": "7890",
        "mailing_address": {
          "street": "321 River Road",
          "unit": null,
          "city": "Portland",
          "state": "Oregon",
          "zip_code": "97201"
        },
        "email": "afoster.pdx@outlook.com",
        "monthly_income": 4900,
        "job_tenure_months": 6,
        "application_job_tenure": 6,
        "job_change_reason": "Career advancement opportunity"
      },
      "expected_flow": ["identity_verification", "contact_information", "employment_verification", "final_confirmation"],
      "expected_outcome": "success_with_clarification"
    },
    {
      "scenario_name": "partial_identity_failure_then_success",
      "description": "User provides wrong info first, then corrects it",
      "applicant_data": {
        "name": "Kevin Park",
        "date_of_birth": "1975-07-25",
        "ssn_last_four": "1357",
        "first_attempt": {
          "date_of_birth": "1975-07-26",
          "ssn_last_four": "1357"
        },
        "second_attempt": {
          "date_of_birth": "1975-07-25",
          "ssn_last_four": "1357"
        },
        "mailing_address": {
          "street": "654 Highland Drive",
          "unit": null,
          "city": "Nashville",
          "state": "Tennessee",
          "zip_code": "37201"
        },
        "email": "kpark.music@gmail.com",
        "monthly_income": 6200,
        "job_tenure_months": 96
      },
      "expected_flow": ["identity_verification", "contact_information", "employment_verification", "final_confirmation"],
      "expected_outcome": "success"
    }
  ],
  "system_variables": {
    "job_tenure_threshold_months": 15,
    "max_identity_attempts": 2,
    "required_fields": ["name", "date_of_birth", "ssn_last_four", "mailing_address", "monthly_income"],
    "optional_fields": ["email", "unit_number"]
  },
  "response_templates": {
    "identity_failure": "I understand this can be frustrating. However, the last four digits of your Social Security Number and date of birth are required to proceed with the verification. Since we're unable to verify this information today, I'll need to conclude our call. Thank you for your time, and please feel free to call back when you have this information available.",
    "job_tenure_discrepancy": "I show on your application that you've been employed for {application_tenure} months. Can you help me understand the difference between what you're telling me now - {stated_tenure} months - and what's shown on the application?",
    "unit_number_prompt": "Is there a unit number or apartment number for this address?",
    "final_confirmation": "Let me summarize the information we've collected today to make sure everything is accurate..."
  }
}