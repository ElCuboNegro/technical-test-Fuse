import { Pool } from 'pg';
import { DatabaseManager } from './connection/database-manager';
import { ContactData } from './interfaces';

/**
 * Contact Information Database Persistence
 * 
 * This module provides database persistence functions for contact information
 * with proper foreign key constraints, session-based updates, and performance optimization.
 * 
 * Requirements addressed:
 * - R4.2: Database persistence functions with parameterized queries
 * - R4.3: Contact data upsert logic with session-based updates
 * - R6.1: Database indexes for performance optimization
 * - R6.3: Proper foreign key constraints
 */

export interface ContactInformationRecord {
  id?: string;
  session_id: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  unit_number?: string | null;
  email?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface ContactPersistenceResult {
  success: boolean;
  contactId?: string;
  error?: string;
  isUpdate?: boolean;
}

export interface ContactQueryOptions {
  includeEmail?: boolean;
  orderBy?: 'created_at' | 'updated_at';
  orderDirection?: 'ASC' | 'DESC';
}

export class ContactPersistence {
  private dbManager: DatabaseManager;
  private environment: 'test' | 'production';

  constructor(environment: 'test' | 'production' = 'production') {
    this.dbManager = new DatabaseManager();
    this.environment = environment;
  }

  /**
   * Get database pool for the configured environment
   */
  private getPool(): Pool {
    return this.dbManager.getPool(this.environment);
  }

  /**
   * Ensure conversation session exists before inserting contact information
   * Requirements: R6.3 - Proper foreign key constraints
   */
  async ensureSessionExists(sessionId: string): Promise<boolean> {
    const pool = this.getPool();
    const client = await pool.connect();

    try {
      // Check if session exists
      const checkResult = await client.query(
        'SELECT id FROM conversation_sessions WHERE id = $1',
        [sessionId]
      );

      if (checkResult.rows.length > 0) {
        return true;
      }

      // Create session if it doesn't exist
      await client.query(
        `INSERT INTO conversation_sessions (id, status, created_at, updated_at) 
         VALUES ($1, 'active', NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [sessionId]
      );

      return true;
    } catch (error) {
      console.error('Error ensuring session exists:', error);
      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Upsert contact information for a session
   * Requirements: R4.2, R4.3 - Database persistence with session-based updates
   */
  async upsertContactInformation(
    sessionId: string,
    contactData: ContactInformationRecord
  ): Promise<ContactPersistenceResult> {
    const pool = this.getPool();
    const client = await pool.connect();

    try {
      // Ensure session exists first
      const sessionExists = await this.ensureSessionExists(sessionId);
      if (!sessionExists) {
        return {
          success: false,
          error: 'Failed to ensure session exists'
        };
      }

      // Check if contact information already exists for this session
      const existingResult = await client.query(
        'SELECT id FROM contact_information WHERE session_id = $1',
        [sessionId]
      );

      const isUpdate = existingResult.rows.length > 0;

      let result;
      if (isUpdate) {
        // Update existing record
        result = await client.query(
          `UPDATE contact_information 
           SET street_address = $2,
               city = $3,
               state = $4,
               zip_code = $5,
               unit_number = $6,
               email = $7,
               updated_at = NOW()
           WHERE session_id = $1
           RETURNING id`,
          [
            sessionId,
            contactData.street_address,
            contactData.city,
            contactData.state.toUpperCase(), // Normalize state to uppercase
            contactData.zip_code,
            contactData.unit_number,
            contactData.email?.toLowerCase() // Normalize email to lowercase
          ]
        );
      } else {
        // Insert new record
        result = await client.query(
          `INSERT INTO contact_information 
           (session_id, street_address, city, state, zip_code, unit_number, email, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           RETURNING id`,
          [
            sessionId,
            contactData.street_address,
            contactData.city,
            contactData.state.toUpperCase(),
            contactData.zip_code,
            contactData.unit_number,
            contactData.email?.toLowerCase()
          ]
        );
      }

      return {
        success: true,
        contactId: result.rows[0].id,
        isUpdate
      };
    } catch (error) {
      console.error('Error upserting contact information:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown database error'
      };
    } finally {
      client.release();
    }
  }

  /**
   * Retrieve contact information by session ID
   * Requirements: R4.2 - Database persistence functions with parameterized queries
   */
  async getContactInformationBySession(
    sessionId: string,
    options: ContactQueryOptions = {}
  ): Promise<ContactInformationRecord | null> {
    const pool = this.getPool();
    const client = await pool.connect();

    try {
      const orderBy = options.orderBy || 'created_at';
      const orderDirection = options.orderDirection || 'DESC';

      const result = await client.query(
        `SELECT id, session_id, street_address, city, state, zip_code, 
                unit_number, email, created_at, updated_at
         FROM contact_information 
         WHERE session_id = $1
         ORDER BY ${orderBy} ${orderDirection}
         LIMIT 1`,
        [sessionId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        session_id: row.session_id,
        street_address: row.street_address,
        city: row.city,
        state: row.state,
        zip_code: row.zip_code,
        unit_number: row.unit_number,
        email: row.email,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    } catch (error) {
      console.error('Error retrieving contact information:', error);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Delete contact information by session ID
   * Requirements: R4.2 - Database persistence functions with parameterized queries
   */
  async deleteContactInformationBySession(sessionId: string): Promise<boolean> {
    const pool = this.getPool();
    const client = await pool.connect();

    try {
      const result = await client.query(
        'DELETE FROM contact_information WHERE session_id = $1',
        [sessionId]
      );

      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error('Error deleting contact information:', error);
      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Get contact information statistics for monitoring
   * Requirements: R6.1 - Database indexes for performance optimization
   */
  async getContactStatistics(): Promise<{
    totalRecords: number;
    recordsWithEmail: number;
    recordsWithUnit: number;
    uniqueSessions: number;
  }> {
    const pool = this.getPool();
    const client = await pool.connect();

    try {
      const result = await client.query(`
        SELECT 
          COUNT(*) as total_records,
          COUNT(email) as records_with_email,
          COUNT(unit_number) as records_with_unit,
          COUNT(DISTINCT session_id) as unique_sessions
        FROM contact_information
      `);

      const row = result.rows[0];
      return {
        totalRecords: parseInt(row.total_records),
        recordsWithEmail: parseInt(row.records_with_email),
        recordsWithUnit: parseInt(row.records_with_unit),
        uniqueSessions: parseInt(row.unique_sessions)
      };
    } catch (error) {
      console.error('Error getting contact statistics:', error);
      return {
        totalRecords: 0,
        recordsWithEmail: 0,
        recordsWithUnit: 0,
        uniqueSessions: 0
      };
    } finally {
      client.release();
    }
  }

  /**
   * Validate contact data before persistence
   * Requirements: R6.1 - Input validation and sanitization
   */
  validateContactData(contactData: ContactInformationRecord): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validate required fields
    if (!contactData.session_id?.trim()) {
      errors.push('Session ID is required');
    }

    if (!contactData.street_address?.trim()) {
      errors.push('Street address is required');
    }

    if (!contactData.city?.trim()) {
      errors.push('City is required');
    }

    if (!contactData.state?.trim()) {
      errors.push('State is required');
    } else if (contactData.state.length !== 2) {
      errors.push('State must be a 2-letter code');
    }

    if (!contactData.zip_code?.trim()) {
      errors.push('ZIP code is required');
    } else if (!/^\d{5}(-\d{4})?$/.test(contactData.zip_code)) {
      errors.push('ZIP code must be in format XXXXX or XXXXX-XXXX');
    }

    // Validate email format if provided
    if (contactData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactData.email)) {
      errors.push('Email format is invalid');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Record contact collection attempt for audit trail
   * Requirements: R6.3 - Audit trail for collection events
   */
  async recordContactAttempt(
    sessionId: string,
    userId: string | null,
    success: boolean,
    reason?: string
  ): Promise<boolean> {
    const pool = this.getPool();
    const client = await pool.connect();

    try {
      // Get current attempt number for this session and node
      const attemptResult = await client.query(
        `SELECT COALESCE(MAX(attempt_number), 0) + 1 as next_attempt
         FROM verification_attempts 
         WHERE session_id = $1 AND node = 'contact'`,
        [sessionId]
      );

      const attemptNumber = attemptResult.rows[0].next_attempt;

      // Insert verification attempt record
      await client.query(
        `INSERT INTO verification_attempts 
         (session_id, user_id, node, attempt_number, success, reason, created_at)
         VALUES ($1, $2, 'contact', $3, $4, $5, NOW())`,
        [sessionId, userId, attemptNumber, success, reason]
      );

      return true;
    } catch (error) {
      console.error('Error recording contact attempt:', error);
      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Get contact collection attempts for a session
   * Requirements: R6.3 - Audit trail for collection events
   */
  async getContactAttempts(sessionId: string): Promise<Array<{
    id: string;
    attempt_number: number;
    success: boolean;
    reason?: string;
    created_at: Date;
  }>> {
    const pool = this.getPool();
    const client = await pool.connect();

    try {
      const result = await client.query(
        `SELECT id, attempt_number, success, reason, created_at
         FROM verification_attempts 
         WHERE session_id = $1 AND node = 'contact'
         ORDER BY attempt_number ASC`,
        [sessionId]
      );

      return result.rows.map(row => ({
        id: row.id,
        attempt_number: row.attempt_number,
        success: row.success,
        reason: row.reason,
        created_at: row.created_at
      }));
    } catch (error) {
      console.error('Error getting contact attempts:', error);
      return [];
    } finally {
      client.release();
    }
  }

  /**
   * Close database connections
   */
  async close(): Promise<void> {
    await this.dbManager.shutdown();
  }
}

/**
 * Utility functions for contact data processing
 */

/**
 * Normalize contact data for consistent storage
 * Requirements: R6.1 - Input validation and sanitization
 */
export function normalizeContactData(
  contactData: Partial<ContactInformationRecord>
): ContactInformationRecord {
  return {
    session_id: contactData.session_id?.trim() || '',
    street_address: contactData.street_address?.trim() || '',
    city: contactData.city?.trim() || '',
    state: contactData.state?.trim().toUpperCase() || '',
    zip_code: contactData.zip_code?.trim().replace(/\s/g, '') || '',
    unit_number: contactData.unit_number?.trim() || null,
    email: contactData.email?.trim().toLowerCase() || null
  };
}

/**
 * Sanitize contact data to prevent injection attacks
 * Requirements: R6.1 - Input validation and sanitization
 */
export function sanitizeContactData(
  contactData: ContactInformationRecord
): ContactInformationRecord {
  // Remove potentially dangerous characters and normalize
  return {
    ...contactData,
    street_address: contactData.street_address.replace(/[<>'"]/g, ''),
    city: contactData.city.replace(/[<>'"]/g, ''),
    state: contactData.state.replace(/[^A-Z]/g, ''),
    zip_code: contactData.zip_code.replace(/[^0-9-]/g, ''),
    unit_number: contactData.unit_number?.replace(/[<>'"]/g, '') || null,
    email: contactData.email?.replace(/[<>'"]/g, '') || null
  };
}