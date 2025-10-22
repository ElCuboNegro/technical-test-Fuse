/**
 * Unit Number Detection Utilities
 * 
 * Provides utilities for detecting multi-unit addresses and handling unit number collection
 * with single-request pattern.
 * 
 * Requirements: R1.3, R1.4
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
 * Detect if an address likely requires a unit number based on street indicators
 * 
 * Requirements: R1.3
 */
export function detectMultiUnitAddress(street: string): boolean {
  if (!street || typeof street !== 'string') {
    return false;
  }

  const trimmedStreet = street.trim();
  if (trimmedStreet.length === 0) {
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

  // If already asked, don't ask again (single-request pattern)
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

  // Single-unit address, no prompt needed but mark as asked
  return {
    address,
    unitNumberAsked: true,
    needsUnitPrompt: false
  };
}

/**
 * Validate unit number format and content
 * 
 * Requirements: R1.4
 */
export function validateUnitNumber(unitNumber: string): boolean {
  if (!unitNumber || typeof unitNumber !== 'string') {
    return false;
  }

  const trimmed = unitNumber.trim();
  
  // Empty or whitespace-only strings are invalid
  if (trimmed.length === 0) {
    return false;
  }

  // Reasonable length limit (100 characters should be more than enough)
  if (trimmed.length > 100) {
    return false;
  }

  // Any non-empty, reasonable-length string is considered valid
  // This allows for various formats: "Apt 4B", "Suite 200", "15F", "A", "#5", etc.
  return true;
}

/**
 * Normalize unit number by trimming whitespace and standardizing common abbreviations
 * 
 * Requirements: R1.4
 */
export function normalizeUnitNumber(unitNumber: string): string {
  if (!unitNumber || typeof unitNumber !== 'string') {
    return '';
  }

  let normalized = unitNumber.trim();
  
  if (normalized.length === 0) {
    return '';
  }

  // Standardize common abbreviations (case-insensitive)
  const abbreviations: { [key: string]: string } = {
    'apartment': 'Apt',
    'suite': 'Suite'
  };

  // Check if the unit number starts with a word that should be abbreviated
  for (const [fullWord, abbrev] of Object.entries(abbreviations)) {
    const regex = new RegExp(`^${fullWord}\\s+`, 'i');
    if (regex.test(normalized)) {
      normalized = normalized.replace(regex, `${abbrev} `);
      break;
    }
  }

  return normalized;
}