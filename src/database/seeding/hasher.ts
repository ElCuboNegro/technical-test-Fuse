import { createHash } from 'crypto';
import { 
  IdentityHasher as IIdentityHasher,
  HashedIdentity,
  IdentityData,
  HashingSalts
} from '../interfaces/index';
import { ConfigurationManager } from '../configuration/manager';

/**
 * IdentityHasher handles secure hashing of PII data
 * Requirements addressed: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */
export class IdentityHasher implements IIdentityHasher {
  private salts: HashingSalts;

  constructor() {
    const configManager = new ConfigurationManager();
    this.salts = configManager.getHashingSalts();
  }

  /**
   * Hash date of birth using SHA-256 with salt
   */
  hashDateOfBirth(dob: string): string {
    if (!this.validateDobFormat(dob)) {
      throw new Error(`Invalid date of birth format: ${dob}. Expected YYYY-MM-DD format.`);
    }

    const hash = createHash('sha256');
    hash.update(dob + this.salts.dobSalt);
    return hash.digest('hex');
  }

  /**
   * Hash SSN last 4 digits using SHA-256 with salt
   */
  hashSsnLast4(ssn: string): string {
    if (!this.validateSsnFormat(ssn)) {
      throw new Error(`Invalid SSN last 4 format: ${ssn}. Expected exactly 4 digits.`);
    }

    const hash = createHash('sha256');
    hash.update(ssn + this.salts.ssnSalt);
    return hash.digest('hex');
  }

  /**
   * Validate SSN last 4 format (exactly 4 digits)
   */
  validateSsnFormat(ssn: string): boolean {
    return /^\d{4}$/.test(ssn);
  }

  /**
   * Validate date of birth format (YYYY-MM-DD)
   */
  validateDobFormat(dob: string): boolean {
    // Check format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      return false;
    }

    // Check if it's a valid date
    const date = new Date(dob);
    
    // Check if date is valid (not NaN) and matches the input
    if (isNaN(date.getTime())) {
      return false;
    }
    
    try {
      return date.toISOString().slice(0, 10) === dob;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create hashed identity record
   */
  createHashedIdentity(identity: IdentityData, externalRef: string): HashedIdentity {
    try {
      const dobHash = this.hashDateOfBirth(identity.date_of_birth);
      const ssnLast4Hash = this.hashSsnLast4(identity.ssn_last_four);

      return {
        dobHash,
        ssnLast4Hash,
        externalReference: externalRef
      };
    } catch (error) {
      throw new Error(`Failed to create hashed identity for ${externalRef}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate identity data before hashing
   */
  validateIdentityData(identity: IdentityData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!identity.date_of_birth) {
      errors.push('Date of birth is required');
    } else if (!this.validateDobFormat(identity.date_of_birth)) {
      errors.push('Invalid date of birth format. Expected YYYY-MM-DD');
    }

    if (!identity.ssn_last_four) {
      errors.push('SSN last 4 digits is required');
    } else if (!this.validateSsnFormat(identity.ssn_last_four)) {
      errors.push('Invalid SSN format. Expected exactly 4 digits');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Hash multiple identities in batch
   */
  createHashedIdentities(identities: Array<{ identity: IdentityData; externalRef: string }>): HashedIdentity[] {
    const results: HashedIdentity[] = [];
    const errors: string[] = [];

    for (const { identity, externalRef } of identities) {
      try {
        const hashedIdentity = this.createHashedIdentity(identity, externalRef);
        results.push(hashedIdentity);
      } catch (error) {
        errors.push(`Failed to hash identity for ${externalRef}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    if (errors.length > 0) {
      console.warn('Some identities failed to hash:', errors);
    }

    return results;
  }

  /**
   * Verify hashed identity matches original data
   */
  verifyHashedIdentity(original: IdentityData, hashed: HashedIdentity): boolean {
    try {
      const expectedDobHash = this.hashDateOfBirth(original.date_of_birth);
      const expectedSsnHash = this.hashSsnLast4(original.ssn_last_four);

      return hashed.dobHash === expectedDobHash && hashed.ssnLast4Hash === expectedSsnHash;
    } catch (error) {
      console.error('Error verifying hashed identity:', error);
      return false;
    }
  }

  /**
   * Get salt information (for debugging, without exposing actual salts)
   */
  getSaltInfo(): { ssnSaltSet: boolean; dobSaltSet: boolean; saltsMatch: boolean } {
    return {
      ssnSaltSet: !!this.salts.ssnSalt,
      dobSaltSet: !!this.salts.dobSalt,
      saltsMatch: this.salts.ssnSalt === this.salts.dobSalt
    };
  }
}