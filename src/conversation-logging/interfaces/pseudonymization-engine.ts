/**
 * Pseudonymization engine interfaces for deterministic PII masking
 * Requirements: 8.1, 8.2
 */

/**
 * Result of pseudonymization operation with masked and hashed values
 */
export interface PseudonymizationResult {
  /** Masked value for display/logging (e.g., "****") */
  masked: string;
  
  /** SHA-256 hash with rotating salt for analytics correlation */
  hash: string;
}

/**
 * Email pseudonymization result with optional domain preservation
 */
export interface EmailPseudonymizationResult {
  /** Masked email format (e.g., "****@****.***") */
  masked: string;
  
  /** Optional preserved domain for analytics */
  domain?: string;
  
  /** Hash of the full email for correlation */
  hash: string;
}

/**
 * Core pseudonymization engine interface for deterministic PII masking
 * Implements fail-closed semantics with cryptographic hashing
 */
export interface PseudonymizationEngine {
  /**
   * Pseudonymize entire payload, applying field-specific rules
   * @param payload Raw payload containing potential PII
   * @returns Pseudonymized payload safe for persistence
   */
  pseudonymizePayload(payload: Record<string, any>): Promise<Record<string, any>>;
  
  /**
   * Generate deterministic pseudonym for user identification
   * @param userId Original user identifier
   * @returns Pseudonymized user identifier
   */
  generateUserPseudonym(userId: string): Promise<string>;
  
  /**
   * Handle pseudonymization failure with fail-closed masking
   * @param field Field name that failed pseudonymization
   * @returns Redacted placeholder value
   */
  handleFailure(field: string): string;
  
  /**
   * Mask SSN last-4 digits with deterministic hashing
   * @param ssn SSN last-4 digits
   * @returns Masked display value and hash for correlation
   */
  maskSSN(ssn: string): Promise<PseudonymizationResult>;
  
  /**
   * Mask date of birth with deterministic hashing
   * @param dob Date of birth in any format
   * @returns Masked display value and hash for correlation
   */
  maskDOB(dob: string): Promise<PseudonymizationResult>;
  
  /**
   * Mask email with optional domain preservation
   * @param email Email address
   * @returns Masked email with optional domain and hash
   */
  maskEmail(email: string): Promise<EmailPseudonymizationResult>;
  
  /**
   * Convert income to configurable range buckets
   * @param income Exact income value
   * @returns Income range bucket (e.g., "$50K-$75K")
   */
  bucketIncome(income: number): Promise<string>;
  
  /**
   * Rotate encryption salts for forward security
   * Implements dual-read compatibility during transition
   */
  rotateSalts(): Promise<void>;
}

/**
 * Database-level pseudonymization enforcement interface
 * Implements triggers, views, and stored procedures for PII protection
 */
export interface DatabasePseudonymizationEngine {
  /**
   * Apply database triggers to enforce field masking
   * Prevents raw PII insertion using regex pattern matching
   */
  enforceFieldMasking(): Promise<void>;
  
  /**
   * Apply field-level encryption to sensitive columns
   * @param column Column name to encrypt
   */
  applyEncryption(column: string): Promise<void>;
  
  /**
   * Create pseudonymized views for analytics access
   * Exposes only masked/hashed data to analytics roles
   */
  createPseudonymizedViews(): Promise<void>;
  
  /**
   * Enforce row-level security policies
   * Restricts data access based on user roles
   */
  enforceRowLevelSecurity(): Promise<void>;
  
  /**
   * Rotate encryption keys using KMS
   * Implements quarterly key rotation with dual-read compatibility
   */
  rotateEncryptionKeys(): Promise<void>;
}