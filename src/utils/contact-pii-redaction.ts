/**
 * Contact PII Redaction Utilities
 * 
 * Provides utilities for redacting personally identifiable information (PII)
 * from contact data for secure logging and telemetry.
 * 
 * Requirements: R6.1, R6.2, R6.3, R6.4
 */

export interface AddressData {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  unitNumber?: string;
}

export interface ContactData {
  address: AddressData;
  email?: string;
}

export interface RedactedContactData {
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    unitNumber?: string;
  };
  email?: string;
}

/**
 * Redact contact PII for secure logging and telemetry
 * 
 * Requirements: R6.4
 */
export function redactContactPII(contactData: ContactData | AddressData): RedactedContactData | any {
  if (!contactData) {
    return null;
  }

  // Handle AddressData directly
  if ('street' in contactData && !('address' in contactData)) {
    return redactAddressPII(contactData as AddressData);
  }

  // Handle ContactData with nested address
  const contact = contactData as ContactData;
  
  return {
    address: redactAddressPII(contact.address),
    email: contact.email ? redactEmailPII(contact.email) : undefined
  };
}

/**
 * Redact address PII while preserving useful information for analytics
 * 
 * Requirements: R6.4
 */
export function redactAddressPII(address: AddressData): any {
  if (!address) {
    return null;
  }

  return {
    street: redactStreetAddress(address.street),
    city: redactCity(address.city),
    state: address.state, // State codes are not PII
    zipCode: redactZipCode(address.zipCode),
    unitNumber: address.unitNumber ? redactUnitNumber(address.unitNumber) : undefined
  };
}

/**
 * Redact street address while preserving general location info
 * 
 * Requirements: R6.4
 */
function redactStreetAddress(street: string): string {
  if (!street || typeof street !== 'string') {
    return '****';
  }

  // Extract street type (Street, Avenue, etc.) for analytics
  const streetTypeMatch = street.match(/\b(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Place|Pl|Court|Ct)\b/i);
  const streetType = streetTypeMatch ? streetTypeMatch[0] : 'Street';
  
  return `**** ${streetType}`;
}

/**
 * Redact city while preserving state-level analytics
 * 
 * Requirements: R6.4
 */
function redactCity(city: string): string {
  if (!city || typeof city !== 'string') {
    return '****';
  }

  // For analytics, we might want to preserve the first letter or length
  // For now, fully redact
  return '****';
}

/**
 * Redact ZIP code while preserving regional analytics
 * 
 * Requirements: R6.4
 */
function redactZipCode(zipCode: string): string {
  if (!zipCode || typeof zipCode !== 'string') {
    return '*****';
  }

  // Preserve first 3 digits for regional analytics, redact last 2
  if (zipCode.length >= 5) {
    const firstThree = zipCode.substring(0, 3);
    if (zipCode.includes('-')) {
      return `${firstThree}**-****`;
    }
    return `${firstThree}**`;
  }
  
  return '*****';
}

/**
 * Redact unit number while preserving unit type info
 * 
 * Requirements: R6.4
 */
function redactUnitNumber(unitNumber: string): string {
  if (!unitNumber || typeof unitNumber !== 'string') {
    return '****';
  }

  // Extract unit type (Apt, Suite, etc.) for analytics
  const unitTypeMatch = unitNumber.match(/^(Apt|Apartment|Suite|Ste|Unit|Building|Bldg|Floor|Fl|#)\s*/i);
  const unitType = unitTypeMatch ? unitTypeMatch[0].trim() : '';
  
  if (unitType) {
    return `${unitType} ****`;
  }
  
  return '****';
}

/**
 * Redact email PII while preserving domain analytics
 * 
 * Requirements: R6.4
 */
export function redactEmailPII(email: string): string {
  if (!email || typeof email !== 'string') {
    return '****@****.***';
  }

  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1) {
    return '****@****.***';
  }

  const domain = email.substring(atIndex + 1);
  
  // For common domains, preserve for analytics; otherwise redact
  const commonDomains = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'aol.com', 'icloud.com', 'comcast.net', 'verizon.net'
  ];
  
  if (commonDomains.includes(domain.toLowerCase())) {
    return `****@${domain}`;
  }
  
  return '****@****.***';
}

/**
 * Create redacted telemetry data for contact collection events
 * 
 * Requirements: R6.1, R6.2, R6.3, R6.4
 */
export function createRedactedTelemetry(
  contactData: ContactData,
  eventType: string,
  success: boolean,
  additionalData?: any
): any {
  const redactedContact = redactContactPII(contactData);
  
  return {
    eventType,
    success,
    timestamp: new Date().toISOString(),
    redactedData: {
      addressProvided: !!contactData.address,
      emailProvided: !!contactData.email,
      hasUnitNumber: !!contactData.address?.unitNumber,
      address: redactedContact.address,
      email: redactedContact.email
    },
    ...additionalData
  };
}

/**
 * Validate that data is properly redacted before logging
 * 
 * Requirements: R6.1, R6.2, R6.3
 */
export function validateRedaction(data: any): boolean {
  if (!data) {
    return true;
  }

  const dataStr = JSON.stringify(data);
  
  // Check for common PII patterns that should not appear in redacted data
  const piiPatterns = [
    /\b\d{5}(-\d{4})?\b/, // Full ZIP codes (should be partially redacted)
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Full email addresses
    /\b\d+\s+[A-Za-z\s]+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln)\b/i // Full street addresses
  ];
  
  // If any PII patterns are found, redaction failed
  return !piiPatterns.some(pattern => pattern.test(dataStr));
}