import { IdentityHasher } from '../hasher';
import { ConfigurationManager } from '../../configuration/manager';

// Mock the configuration manager
jest.mock('../../configuration/manager');
const MockConfigurationManager = ConfigurationManager as jest.MockedClass<typeof ConfigurationManager>;

describe('IdentityHasher', () => {
  let hasher: IdentityHasher;
  let mockConfigManager: jest.Mocked<ConfigurationManager>;

  const testSalts = {
    ssnSalt: 'test-ssn-salt-12345',
    dobSalt: 'test-dob-salt-67890'
  };

  beforeEach(() => {
    mockConfigManager = {
      getHashingSalts: jest.fn().mockReturnValue(testSalts)
    } as any;

    MockConfigurationManager.mockImplementation(() => mockConfigManager);
    hasher = new IdentityHasher();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('hashDateOfBirth', () => {
    it('should hash valid date of birth consistently', () => {
      const dob = '1985-03-15';
      const hash1 = hasher.hashDateOfBirth(dob);
      const hash2 = hasher.hashDateOfBirth(dob);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 character hex string
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different dates', () => {
      const dob1 = '1985-03-15';
      const dob2 = '1985-03-16';
      
      const hash1 = hasher.hashDateOfBirth(dob1);
      const hash2 = hasher.hashDateOfBirth(dob2);

      expect(hash1).not.toBe(hash2);
    });

    it('should use salt in hashing process', () => {
      const dob = '1985-03-15';
      
      // Create hasher with different salt
      const differentSalts = { ssnSalt: 'different-ssn', dobSalt: 'different-dob' };
      mockConfigManager.getHashingSalts.mockReturnValue(differentSalts);
      const hasher2 = new IdentityHasher();
      
      const hash1 = hasher.hashDateOfBirth(dob);
      const hash2 = hasher2.hashDateOfBirth(dob);

      expect(hash1).not.toBe(hash2);
    });

    it('should throw error for invalid date format', () => {
      const invalidDates = [
        '85-03-15',      // Wrong year format
        '1985-3-15',     // Missing zero padding
        '1985-03-5',     // Missing zero padding
        '1985/03/15',    // Wrong separator
        '15-03-1985',    // Wrong order
        '1985-13-15',    // Invalid month
        '1985-03-32',    // Invalid day
        '1985-02-30',    // Invalid date
        'invalid-date',  // Non-date string
        ''               // Empty string
      ];

      invalidDates.forEach(invalidDate => {
        expect(() => hasher.hashDateOfBirth(invalidDate))
          .toThrow(`Invalid date of birth format: ${invalidDate}. Expected YYYY-MM-DD format.`);
      });
    });
  });

  describe('hashSsnLast4', () => {
    it('should hash valid SSN last 4 consistently', () => {
      const ssn = '7234';
      const hash1 = hasher.hashSsnLast4(ssn);
      const hash2 = hasher.hashSsnLast4(ssn);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 character hex string
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different SSN values', () => {
      const ssn1 = '7234';
      const ssn2 = '7235';
      
      const hash1 = hasher.hashSsnLast4(ssn1);
      const hash2 = hasher.hashSsnLast4(ssn2);

      expect(hash1).not.toBe(hash2);
    });

    it('should use salt in hashing process', () => {
      const ssn = '7234';
      
      // Create hasher with different salt
      const differentSalts = { ssnSalt: 'different-ssn', dobSalt: 'different-dob' };
      mockConfigManager.getHashingSalts.mockReturnValue(differentSalts);
      const hasher2 = new IdentityHasher();
      
      const hash1 = hasher.hashSsnLast4(ssn);
      const hash2 = hasher2.hashSsnLast4(ssn);

      expect(hash1).not.toBe(hash2);
    });

    it('should throw error for invalid SSN format', () => {
      const invalidSSNs = [
        '123',       // Too short
        '12345',     // Too long
        'abcd',      // Non-numeric
        '12a4',      // Mixed characters
        '',          // Empty string
        '12 34',     // Contains space
        '12-34',     // Contains dash
        '12.34'      // Contains dot
      ];

      invalidSSNs.forEach(invalidSSN => {
        expect(() => hasher.hashSsnLast4(invalidSSN))
          .toThrow(`Invalid SSN last 4 format: ${invalidSSN}. Expected exactly 4 digits.`);
      });
    });
  });

  describe('validateSsnFormat', () => {
    it('should return true for valid SSN formats', () => {
      const validSSNs = ['0000', '1234', '9999', '0001', '1000'];
      
      validSSNs.forEach(ssn => {
        expect(hasher.validateSsnFormat(ssn)).toBe(true);
      });
    });

    it('should return false for invalid SSN formats', () => {
      const invalidSSNs = [
        '123',       // Too short
        '12345',     // Too long
        'abcd',      // Non-numeric
        '12a4',      // Mixed characters
        '',          // Empty string
        '12 34',     // Contains space
        '12-34',     // Contains dash
        '12.34'      // Contains dot
      ];

      invalidSSNs.forEach(ssn => {
        expect(hasher.validateSsnFormat(ssn)).toBe(false);
      });
    });
  });

  describe('validateDobFormat', () => {
    it('should return true for valid date formats', () => {
      const validDates = [
        '1985-03-15',
        '2000-01-01',
        '1999-12-31',
        '2024-02-29', // Leap year
        '1900-01-01'
      ];
      
      validDates.forEach(date => {
        expect(hasher.validateDobFormat(date)).toBe(true);
      });
    });

    it('should return false for invalid date formats', () => {
      const invalidDates = [
        '85-03-15',      // Wrong year format
        '1985-3-15',     // Missing zero padding
        '1985-03-5',     // Missing zero padding
        '1985/03/15',    // Wrong separator
        '15-03-1985',    // Wrong order
        '1985-13-15',    // Invalid month
        '1985-03-32',    // Invalid day
        '1985-02-30',    // Invalid date
        '2023-02-29',    // Invalid leap year
        'invalid-date',  // Non-date string
        '',              // Empty string
        '1985-03-15T00:00:00Z' // ISO with time
      ];

      invalidDates.forEach(date => {
        expect(hasher.validateDobFormat(date)).toBe(false);
      });
    });
  });

  describe('createHashedIdentity', () => {
    it('should create hashed identity with valid data', () => {
      const identity = {
        date_of_birth: '1985-03-15',
        ssn_last_four: '7234'
      };
      const externalRef = 'test-scenario-1';

      const result = hasher.createHashedIdentity(identity, externalRef);

      expect(result.externalReference).toBe(externalRef);
      expect(result.dobHash).toHaveLength(64);
      expect(result.ssnLast4Hash).toHaveLength(64);
      expect(result.dobHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.ssnLast4Hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should throw error for invalid identity data', () => {
      const invalidIdentities = [
        { date_of_birth: 'invalid-date', ssn_last_four: '7234' },
        { date_of_birth: '1985-03-15', ssn_last_four: 'invalid' },
        { date_of_birth: '', ssn_last_four: '7234' },
        { date_of_birth: '1985-03-15', ssn_last_four: '' }
      ];

      invalidIdentities.forEach(identity => {
        expect(() => hasher.createHashedIdentity(identity, 'test-ref'))
          .toThrow(/Failed to create hashed identity for test-ref:/);
      });
    });
  });

  describe('validateIdentityData', () => {
    it('should return valid for correct identity data', () => {
      const identity = {
        date_of_birth: '1985-03-15',
        ssn_last_four: '7234'
      };

      const result = hasher.validateIdentityData(identity);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for missing required fields', () => {
      const identity = {
        date_of_birth: '',
        ssn_last_four: ''
      };

      const result = hasher.validateIdentityData(identity);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Date of birth is required');
      expect(result.errors).toContain('SSN last 4 digits is required');
    });

    it('should return errors for invalid formats', () => {
      const identity = {
        date_of_birth: 'invalid-date',
        ssn_last_four: 'invalid-ssn'
      };

      const result = hasher.validateIdentityData(identity);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid date of birth format. Expected YYYY-MM-DD');
      expect(result.errors).toContain('Invalid SSN format. Expected exactly 4 digits');
    });
  });

  describe('createHashedIdentities', () => {
    it('should hash multiple identities successfully', () => {
      const identities = [
        { identity: { date_of_birth: '1985-03-15', ssn_last_four: '7234' }, externalRef: 'test-1' },
        { identity: { date_of_birth: '1990-06-22', ssn_last_four: '5639' }, externalRef: 'test-2' }
      ];

      const results = hasher.createHashedIdentities(identities);

      expect(results).toHaveLength(2);
      expect(results[0].externalReference).toBe('test-1');
      expect(results[1].externalReference).toBe('test-2');
      expect(results[0].dobHash).not.toBe(results[1].dobHash);
      expect(results[0].ssnLast4Hash).not.toBe(results[1].ssnLast4Hash);
    });

    it('should handle partial failures gracefully', () => {
      const identities = [
        { identity: { date_of_birth: '1985-03-15', ssn_last_four: '7234' }, externalRef: 'test-1' },
        { identity: { date_of_birth: 'invalid', ssn_last_four: '5639' }, externalRef: 'test-2' },
        { identity: { date_of_birth: '1992-09-18', ssn_last_four: '4521' }, externalRef: 'test-3' }
      ];

      const results = hasher.createHashedIdentities(identities);

      // Should return only successful hashes
      expect(results).toHaveLength(2);
      expect(results[0].externalReference).toBe('test-1');
      expect(results[1].externalReference).toBe('test-3');
    });
  });

  describe('verifyHashedIdentity', () => {
    it('should verify correct hashed identity', () => {
      const original = {
        date_of_birth: '1985-03-15',
        ssn_last_four: '7234'
      };
      const hashed = hasher.createHashedIdentity(original, 'test-ref');

      const isValid = hasher.verifyHashedIdentity(original, hashed);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect hashed identity', () => {
      const original = {
        date_of_birth: '1985-03-15',
        ssn_last_four: '7234'
      };
      const different = {
        date_of_birth: '1985-03-16',
        ssn_last_four: '7234'
      };
      const hashed = hasher.createHashedIdentity(different, 'test-ref');

      const isValid = hasher.verifyHashedIdentity(original, hashed);

      expect(isValid).toBe(false);
    });

    it('should handle verification errors gracefully', () => {
      const original = {
        date_of_birth: 'invalid-date',
        ssn_last_four: '7234'
      };
      const hashed = {
        dobHash: 'some-hash',
        ssnLast4Hash: 'some-hash',
        externalReference: 'test-ref'
      };

      const isValid = hasher.verifyHashedIdentity(original, hashed);

      expect(isValid).toBe(false);
    });
  });

  describe('getSaltInfo', () => {
    it('should return salt information without exposing actual salts', () => {
      const saltInfo = hasher.getSaltInfo();

      expect(saltInfo.ssnSaltSet).toBe(true);
      expect(saltInfo.dobSaltSet).toBe(true);
      expect(saltInfo.saltsMatch).toBe(false); // Different salts
      expect(saltInfo).not.toHaveProperty('ssnSalt');
      expect(saltInfo).not.toHaveProperty('dobSalt');
    });

    it('should detect missing salts', () => {
      mockConfigManager.getHashingSalts.mockReturnValue({
        ssnSalt: '',
        dobSalt: 'test-dob-salt'
      });
      const hasher2 = new IdentityHasher();

      const saltInfo = hasher2.getSaltInfo();

      expect(saltInfo.ssnSaltSet).toBe(false);
      expect(saltInfo.dobSaltSet).toBe(true);
    });
  });

  describe('PII protection in error messages', () => {
    it('should not expose raw PII in error messages', () => {
      const sensitiveData = {
        date_of_birth: '1985-03-15',
        ssn_last_four: '7234'
      };

      // Test with invalid format to trigger error
      expect(() => hasher.hashDateOfBirth('invalid-date'))
        .toThrow(/Invalid date of birth format: invalid-date/);
      
      expect(() => hasher.hashSsnLast4('invalid-ssn'))
        .toThrow(/Invalid SSN last 4 format: invalid-ssn/);

      // Verify that valid data doesn't appear in error messages
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      try {
        hasher.verifyHashedIdentity(
          { date_of_birth: 'invalid', ssn_last_four: '7234' },
          { dobHash: 'hash', ssnLast4Hash: 'hash', externalReference: 'ref' }
        );
      } catch (error) {
        // Should not throw, but if it does, check error message
      }

      // Check that console.error was called but doesn't contain PII
      if (consoleSpy.mock.calls.length > 0) {
        const errorMessages = consoleSpy.mock.calls.map(call => call.join(' '));
        errorMessages.forEach(message => {
          expect(message).not.toContain('7234');
          expect(message).not.toContain('1985-03-15');
        });
      }

      consoleSpy.mockRestore();
    });
  });

  describe('consistent hashing with same salt values', () => {
    it('should produce identical hashes across different hasher instances with same salts', () => {
      const identity = {
        date_of_birth: '1985-03-15',
        ssn_last_four: '7234'
      };

      // Create second hasher instance with same salts
      const hasher2 = new IdentityHasher();
      
      const hash1 = hasher.createHashedIdentity(identity, 'test-ref');
      const hash2 = hasher2.createHashedIdentity(identity, 'test-ref');

      expect(hash1.dobHash).toBe(hash2.dobHash);
      expect(hash1.ssnLast4Hash).toBe(hash2.ssnLast4Hash);
    });

    it('should produce different hashes with different salts', () => {
      const identity = {
        date_of_birth: '1985-03-15',
        ssn_last_four: '7234'
      };

      // Create hasher with different salts
      mockConfigManager.getHashingSalts.mockReturnValue({
        ssnSalt: 'different-ssn-salt',
        dobSalt: 'different-dob-salt'
      });
      const hasher2 = new IdentityHasher();
      
      const hash1 = hasher.createHashedIdentity(identity, 'test-ref');
      const hash2 = hasher2.createHashedIdentity(identity, 'test-ref');

      expect(hash1.dobHash).not.toBe(hash2.dobHash);
      expect(hash1.ssnLast4Hash).not.toBe(hash2.ssnLast4Hash);
    });
  });
});