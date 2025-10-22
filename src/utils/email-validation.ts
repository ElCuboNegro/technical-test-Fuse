/**
 * Email Validation & Normalization Utilities
 * 
 * Provides validation, normalization, and extraction utilities for email addresses
 * used by the contact information node.
 * 
 * Requirements: R2.1, R2.2, R2.3, R2.4, R6.2
 */

/**
 * Validate email format using standard email regex
 * 
 * Requirements: R2.1
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Trim whitespace for validation
  const trimmed = email.trim();
  
  if (trimmed.length === 0) {
    return false;
  }

  // Standard email regex pattern - requires domain with TLD
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(trimmed);
}

/**
 * Normalize email with lowercase and trim operations
 * 
 * Requirements: R2.2, R6.2
 */
export function normalizeEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    return '';
  }

  // Trim whitespace and convert to lowercase for consistent storage
  return email.trim().toLowerCase();
}

/**
 * Extract email from conversation text for parsing
 * 
 * Requirements: R2.3
 */
export function extractEmailFromText(text: string): string | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  // More comprehensive email regex for extraction from conversation text
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const matches = text.match(emailRegex);
  
  if (!matches || matches.length === 0) {
    return null;
  }

  // Return the first valid email found
  for (const match of matches) {
    if (validateEmail(match)) {
      return match;
    }
  }
  
  return null;
}

/**
 * Check if email domain is a common consumer email provider for quality validation
 * 
 * Requirements: R2.4
 */
export function isCommonEmailDomain(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // First validate that it's a proper email format
  if (!validateEmail(email)) {
    return false;
  }

  // Extract domain from email
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1 || atIndex === email.length - 1) {
    return false;
  }

  const domain = email.substring(atIndex + 1).toLowerCase();

  // Extended list of common consumer email domains
  const commonDomains = [
    'gmail.com',
    'yahoo.com', 
    'hotmail.com',
    'outlook.com',
    'live.com',
    'msn.com',
    'aol.com',
    'icloud.com',
    'me.com',
    'mac.com',
    'comcast.net',
    'verizon.net',
    'att.net',
    'sbcglobal.net',
    'cox.net',
    'charter.net',
    'earthlink.net',
    'juno.com',
    'protonmail.com',
    'yandex.com'
  ];

  return commonDomains.includes(domain);
}