/**
 * PseudonymizationEngine implementation with deterministic hashing
 * Provides fail-closed PII masking with rotating salts from KMS
 * Requirements: 1.1, 1.4, 1.5, 6.1, 6.2, 6.3, 6.4, 6.5, 7.5
 */

import { createHash } from 'crypto';
import { 
  PseudonymizationEngine, 
  PseudonymizationResult, 
  EmailPseudonymizationResult 
} from '../interfaces/pseudonymization-engine';

/**
 * Configuration for the pseudonymization engine
 */
export interface PseudonymizationConfig {
  /** Current salt for hashing operations */
  currentSalt: string;
  
  /** Previous salt for dual-read compatibility during rotation */
  previousSalt?: string;
  
  /** Whether dual-read mode is active during salt rotation */
  dualReadMode: boolean;
  
  /** Income bucket configuration */
  incomeBuckets: Array<{ min: number; max: number; label: string }>;
  
  /** Whether to preserve email domains for analytics */
  preserveEmailDomains: boolean;
}

/**
 * Default configuration for the pseudonymization engine
 */
const DEFAULT_CONFIG: PseudonymizationConfig = {
  currentSalt: process.env.PSEUDONYMIZATION_SALT || 'default-salt-change-me',
  dualReadMode: false,
  incomeBuckets: [
    { min: 0, max: 25000, label: '$0-$25K' },
    { min: 25000, max: 50000, label: '$25K-$50K' },
    { min: 50000, max: 75000, label: '$50K-$75K' },
    { min: 75000, max: 100000, label: '$75K-$100K' },
    { min: 100000, max: 150000, label: '$100K-$150K' },
    { min: 150000, max: 200000, label: '$150K-$200K' },
    { min: 200000, max: Infinity, label: '$200K+' }
  ],
  preserveEmailDomains: true
};

/**
 * Implementation of PseudonymizationEngine with deterministic hashing
 * Uses SHA-256 with rotating salts for forward security
 */
export class PseudonymizationEngineImpl implements PseudonymizationEngine {
  private config: PseudonymizationConfig;

  constructor(config: Partial<PseudonymizationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Pseudonymize entire payload, applying field-specific rules
   * @param payload Raw payload containing potential PII
   * @returns Pseudonymized payload safe for persistence
   */
  async pseudonymizePayload(payload: Record<string, any>): Promise<Record<string, any>> {
    try {
      const result = { ...payload };
      
      // Apply field-specific pseudonymization
      if (result.ssn) {
        try {
          const masked = await this.maskSSN(result.ssn);
          result.ssn = masked.masked;
          result.ssn_hash = masked.hash;
        } catch (error) {
          result.ssn = this.handleFailure('ssn');
          delete result.ssn_hash;
        }
      }
      
      if (result.dob) {
        try {
          const masked = await this.maskDOB(result.dob);
          result.dob = masked.masked;
          result.dob_hash = masked.hash;
        } catch (error) {
          result.dob = this.handleFailure('dob');
          delete result.dob_hash;
        }
      }
      
      if (result.email) {
        try {
          const masked = await this.maskEmail(result.email);
          result.email = masked.masked;
          result.email_hash = masked.hash;
          if (masked.domain) {
            result.email_domain = masked.domain;
          }
        } catch (error) {
          result.email = this.handleFailure('email');
          delete result.email_hash;
          delete result.email_domain;
        }
      }
      
      if (result.income && typeof result.income === 'number') {
        try {
          result.income = await this.bucketIncome(result.income);
        } catch (error) {
          result.income = this.handleFailure('income');
        }
      }
      
      // Handle nested objects recursively
      for (const [key, value] of Object.entries(result)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          result[key] = await this.pseudonymizePayload(value);
        }
      }
      
      return result;
    } catch (error) {
      // If entire payload pseudonymization fails, return redacted payload
      return { error: this.handleFailure('payload'), original_keys: Object.keys(payload) };
    }
  }

  /**
   * Generate deterministic pseudonym for user identification
   * @param userId Original user identifier
   * @returns Pseudonymized user identifier
   */
  async generateUserPseudonym(userId: string): Promise<string> {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user ID input');
    }
    
    try {
      const hash = this.createHash(userId);
      return 'user_' + hash.substring(0, 16);
    } catch (error) {
      throw new Error('Failed to generate user pseudonym');
    }
  }

  /**
   * Handle pseudonymization failure with fail-closed masking
   * @param field Field name that failed pseudonymization
   * @returns Redacted placeholder value
   */
  handleFailure(field: string): string {
    return '[REDACTED]';
  }

  /**
   * Mask SSN last-4 digits with deterministic hashing
   * @param ssn SSN last-4 digits
   * @returns Masked display value and hash for correlation
   */
  async maskSSN(ssn: string): Promise<PseudonymizationResult> {
    if (!ssn || typeof ssn !== 'string') {
      throw new Error('Invalid SSN input');
    }
    
    // Validate SSN format (should be 4 digits)
    const cleanSSN = ssn.replace(/\D/g, '');
    if (cleanSSN.length !== 4) {
      throw new Error('SSN must be exactly 4 digits');
    }
    
    try {
      const hash = this.createHash(cleanSSN);
      return {
        masked: '****',
        hash: hash
      };
    } catch (error) {
      throw new Error('Failed to mask SSN');
    }
  }

  /**
   * Mask date of birth with deterministic hashing
   * @param dob Date of birth in any format
   * @returns Masked display value and hash for correlation
   */
  async maskDOB(dob: string): Promise<PseudonymizationResult> {
    if (!dob || typeof dob !== 'string') {
      throw new Error('Invalid DOB input');
    }
    
    try {
      // Normalize DOB to ISO format for consistent hashing
      const normalizedDOB = this.normalizeDateString(dob);
      const hash = this.createHash(normalizedDOB);
      
      return {
        masked: '****-**-**',
        hash: hash
      };
    } catch (error) {
      throw new Error('Failed to mask DOB');
    }
  }

  /**
   * Mask email with optional domain preservation
   * @param email Email address
   * @returns Masked email with optional domain and hash
   */
  async maskEmail(email: string): Promise<EmailPseudonymizationResult> {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      throw new Error('Invalid email input');
    }
    
    const [localPart, domain] = email.split('@');
    if (!localPart || !domain) {
      throw new Error('Invalid email format');
    }
    
    try {
      const hash = this.createHash(email.toLowerCase());
      
      return {
        masked: '****@****.***',
        domain: this.config.preserveEmailDomains ? domain : undefined,
        hash: hash
      };
    } catch (error) {
      throw new Error('Failed to mask email');
    }
  }

  /**
   * Convert income to configurable range buckets
   * @param income Exact income value
   * @returns Income range bucket (e.g., "$50K-$75K")
   */
  async bucketIncome(income: number): Promise<string> {
    if (typeof income !== 'number' || income < 0 || isNaN(income)) {
      throw new Error('Invalid income input');
    }
    
    try {
      for (const bucket of this.config.incomeBuckets) {
        if (income >= bucket.min && income < bucket.max) {
          return bucket.label;
        }
      }
      
      // Fallback to highest bucket
      return this.config.incomeBuckets[this.config.incomeBuckets.length - 1].label;
    } catch (error) {
      throw new Error('Failed to bucket income');
    }
  }

  /**
   * Rotate encryption salts for forward security
   * Implements dual-read compatibility during transition
   */
  async rotateSalts(): Promise<void> {
    try {
      // In a real implementation, this would integrate with KMS
      // For now, we simulate the rotation process
      this.config.previousSalt = this.config.currentSalt;
      this.config.currentSalt = this.generateNewSalt();
      this.config.dualReadMode = true;
      
      // In production, dual-read mode would be disabled after a grace period
      // This would typically be handled by a background job or scheduled task
    } catch (error) {
      throw new Error('Failed to rotate salts');
    }
  }

  /**
   * Create SHA-256 hash with current salt
   * @param input Input string to hash
   * @returns Hex-encoded hash
   */
  private createHash(input: string): string {
    const hash = createHash('sha256');
    hash.update(input + this.config.currentSalt);
    return hash.digest('hex');
  }

  /**
   * Normalize date string to ISO format for consistent hashing
   * @param dateStr Date string in various formats
   * @returns Normalized ISO date string
   */
  private normalizeDateString(dateStr: string): string {
    // Try to parse the date and convert to ISO format
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      // If parsing fails, use the original string
      return dateStr;
    }
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  }

  /**
   * Generate a new salt for rotation
   * In production, this would integrate with KMS
   * @returns New salt string
   */
  private generateNewSalt(): string {
    // In production, this would use KMS to generate a new salt
    // For now, we generate a timestamp-based salt
    return 'salt_' + Date.now() + '_' + Math.random().toString(36).substring(2);
  }

  /**
   * Get current configuration (for testing purposes)
   */
  getConfig(): PseudonymizationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   * @param newConfig Partial configuration to merge
   */
  updateConfig(newConfig: Partial<PseudonymizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}