/**
 * Compliance engine interface for governance queries and privacy validation
 * Requirements: 8.1, 8.2
 */

import { AuditQueryParams, AuditDTO } from './conversation-logger';

/**
 * Date range specification for compliance queries
 */
export interface DateRange {
  /** Start date for the range */
  startDate: Date;
  
  /** End date for the range */
  endDate: Date;
}

/**
 * Compliance report for regulatory audits
 */
export interface ComplianceReport {
  /** Report generation timestamp */
  generatedAt: Date;
  
  /** Reporting period */
  period: DateRange;
  
  /** Total number of sessions processed */
  totalSessions: number;
  
  /** Total number of events logged */
  totalEvents: number;
  
  /** Number of audit events generated */
  auditEvents: number;
  
  /** Data retention compliance status */
  retentionCompliance: {
    /** Events within retention policy */
    compliantEvents: number;
    
    /** Events exceeding retention policy */
    expiredEvents: number;
    
    /** Percentage compliance */
    complianceRate: number;
  };
  
  /** Privacy compliance metrics */
  privacyCompliance: {
    /** Events with successful pseudonymization */
    pseudonymizedEvents: number;
    
    /** Events with pseudonymization failures */
    failedPseudonymization: number;
    
    /** PII detection violations */
    piiViolations: number;
    
    /** Privacy compliance rate */
    complianceRate: number;
  };
  
  /** Access control audit */
  accessAudit: {
    /** Total data access attempts */
    totalAccess: number;
    
    /** Authorized access attempts */
    authorizedAccess: number;
    
    /** Unauthorized access attempts */
    unauthorizedAccess: number;
    
    /** Unique actors accessing data */
    uniqueActors: number;
  };
  
  /** Data quality metrics */
  dataQuality: {
    /** Events with complete metadata */
    completeEvents: number;
    
    /** Events with missing required fields */
    incompleteEvents: number;
    
    /** Data completeness rate */
    completenessRate: number;
  };
}

/**
 * PII validation report for privacy impact assessment
 */
export interface PIIValidationReport {
  /** Validation timestamp */
  validatedAt: Date;
  
  /** Total records scanned */
  totalRecords: number;
  
  /** PII pattern matches found */
  piiMatches: Array<{
    /** Type of PII detected */
    type: 'ssn' | 'dob' | 'email' | 'address' | 'phone' | 'name';
    
    /** Number of matches found */
    count: number;
    
    /** Table/field where PII was found */
    location: string;
    
    /** Sample pattern (redacted) */
    pattern: string;
  }>;
  
  /** Overall PII compliance status */
  complianceStatus: 'compliant' | 'violations_found' | 'scan_failed';
  
  /** Recommended remediation actions */
  recommendations: string[];
}

/**
 * Data access tracking information
 */
export interface DataAccessLog {
  /** Unique access log ID */
  id: string;
  
  /** Actor who accessed the data */
  actor: string;
  
  /** Query or operation performed */
  query: string;
  
  /** Timestamp of access */
  accessedAt: Date;
  
  /** Type of data accessed */
  dataType: string;
  
  /** Number of records accessed */
  recordCount: number;
  
  /** Access result (success/failure) */
  result: 'success' | 'failure';
  
  /** IP address of accessor */
  ipAddress?: string;
  
  /** User agent information */
  userAgent?: string;
}

/**
 * Compliance engine interface for governance and privacy validation
 * Provides privacy-safe query interfaces for regulatory compliance
 */
export interface ComplianceEngine {
  /**
   * Query audit trail for compliance reporting
   * @param params Query parameters for audit data
   * @returns Audit trail records
   */
  queryAuditTrail(params: AuditQueryParams): Promise<AuditDTO[]>;
  
  /**
   * Generate comprehensive compliance report
   * @param period Date range for the report
   * @returns Detailed compliance metrics and status
   */
  generateComplianceReport(period: DateRange): Promise<ComplianceReport>;
  
  /**
   * Validate absence of PII in stored data
   * @returns Privacy impact assessment report
   */
  validatePIIAbsence(): Promise<PIIValidationReport>;
  
  /**
   * Track data access attempts for audit purposes
   * @param actor Identity of the data accessor
   * @param query Query or operation performed
   * @param metadata Additional context information
   */
  trackDataAccess(
    actor: string,
    query: string,
    metadata?: Record<string, any>
  ): Promise<void>;
  
  /**
   * Get data access logs for audit review
   * @param params Query parameters for access logs
   * @returns Data access log entries
   */
  getDataAccessLogs(params: {
    actor?: string;
    startDate?: Date;
    endDate?: Date;
    dataType?: string;
    limit?: number;
    offset?: number;
  }): Promise<DataAccessLog[]>;
  
  /**
   * Validate data retention policy compliance
   * @returns Retention compliance status and metrics
   */
  validateRetentionCompliance(): Promise<{
    compliantRecords: number;
    expiredRecords: number;
    complianceRate: number;
    recommendedActions: string[];
  }>;
  
  /**
   * Generate privacy impact assessment
   * @param scope Scope of the assessment (table, date range, etc.)
   * @returns Privacy impact assessment results
   */
  generatePrivacyImpactAssessment(scope: {
    tables?: string[];
    startDate?: Date;
    endDate?: Date;
  }): Promise<PIIValidationReport>;
  
  /**
   * Export compliance data for external audits
   * @param format Export format (json, csv, xml)
   * @param period Date range for export
   * @returns Exported compliance data
   */
  exportComplianceData(
    format: 'json' | 'csv' | 'xml',
    period: DateRange
  ): Promise<string>;
}