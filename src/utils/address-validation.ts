/**
 * Address Validation Utilities
 * 
 * Provides validation, normalization, and processing utilities for address data
 * used by the contact information node.
 * 
 * Requirements: R1.1, R1.2, R1.3, R1.4
 */

export interface AddressData {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  unitNumber?: string;
}

export interface UnitNumberResult {
  address: AddressData;
  unitNumberAsked: boolean;
  needsUnitPrompt: boolean;
}

/**
 * Normalize address components by trimming whitespace and standardizing formats
 * 
 * Requirements: R1.1, R1.2
 */
export function normalizeAddress(address: any): AddressData {
  if (!address) {
    throw new Error('Address is required');
  }

  return {
    street: address.street?.trim() || '',
    city: address.city?.trim() || '',
    state: address.state?.toUpperCase().trim() || '',
    zipCode: address.zipCode?.replace(/\s/g, '') || '',
    unitNumber: address.unitNumber?.trim() || undefined
  };
}

/**
 * Validate US state codes (50 states + DC)
 * 
 * Requirements: R1.2
 */
export function validateState(state: string): boolean {
  if (!state || typeof state !== 'string') {
    return false;
  }

  const validStates = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    'DC'
  ];

  return validStates.includes(state.toUpperCase());
}

/**
 * Validate ZIP code format (5-digit or 9-digit with dash)
 * 
 * Requirements: R1.2
 */
export function validateZipCode(zipCode: string): boolean {
  if (!zipCode || typeof zipCode !== 'string') {
    return false;
  }

  // Match 5-digit or 9-digit ZIP code format (XXXXX or XXXXX-XXXX)
  return /^\d{5}(-\d{4})?$/.test(zipCode);
}

/**
 * Validate complete address with all required components
 * 
 * Requirements: R1.1, R1.2
 */
export function validateAddress(address: any): boolean {
  if (!address || typeof address !== 'object') {
    return false;
  }

  // Check required fields
  if (!address.street || address.street.trim().length === 0) {
    return false;
  }

  if (!address.city || address.city.trim().length === 0) {
    return false;
  }

  if (!validateState(address.state)) {
    return false;
  }

  if (!validateZipCode(address.zipCode)) {
    return false;
  }

  return true;
}

/**
 * Detect if an address likely requires a unit number
 * 
 * Requirements: R1.3
 */
export function detectMultiUnitAddress(street: string): boolean {
  if (!street || typeof street !== 'string') {
    return false;
  }

  const multiUnitIndicators = [
    'apartment', 'apt', 'suite', 'ste', 'unit', 'building', 'bldg',
    'floor', 'fl', '#', 'number', 'no'
  ];

  const lowerStreet = street.toLowerCase();
  return multiUnitIndicators.some(indicator => lowerStreet.includes(indicator));
}

/**
 * Handle unit number collection logic with single-request pattern
 * 
 * Requirements: R1.3, R1.4
 */
export async function handleUnitNumber(
  address: AddressData,
  alreadyAsked: boolean
): Promise<UnitNumberResult> {
  // If unit number already provided, no need to ask
  if (address.unitNumber) {
    return {
      address,
      unitNumberAsked: true,
      needsUnitPrompt: false
    };
  }

  // If already asked, don't ask again
  if (alreadyAsked) {
    return {
      address,
      unitNumberAsked: true,
      needsUnitPrompt: false
    };
  }

  // Check if this is a multi-unit address
  const isMultiUnit = detectMultiUnitAddress(address.street);

  if (isMultiUnit) {
    // Need to prompt for unit number
    return {
      address,
      unitNumberAsked: true,
      needsUnitPrompt: true
    };
  }

  // Single-unit address, no prompt needed
  return {
    address,
    unitNumberAsked: true,
    needsUnitPrompt: false
  };
}