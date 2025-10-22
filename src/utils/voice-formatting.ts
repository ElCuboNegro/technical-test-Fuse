/**
 * Voice Formatting Utilities
 * 
 * Provides TTS-optimized formatting for addresses, ZIP codes, emails, and other
 * contact information components.
 * 
 * Requirements: R3.1, R3.2, R3.3, R3.4
 */

export interface AddressData {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  unitNumber?: string;
}

/**
 * Format ZIP code for TTS with digit-by-digit pronunciation
 * 
 * Requirements: R3.1, R3.3
 */
export function formatZipForTTS(zipCode: string): string {
  if (!zipCode || typeof zipCode !== 'string') {
    return '';
  }

  if (zipCode.includes('-')) {
    // Handle ZIP+4 format
    const [main, extension] = zipCode.split('-');
    const mainFormatted = main.split('').join('-');
    const extensionFormatted = extension.split('').join('-');
    return `${mainFormatted}, dash, ${extensionFormatted}`;
  }

  // Handle 5-digit ZIP
  return zipCode.split('').join('-');
}

/**
 * Spell email address for TTS with proper pronunciation
 * 
 * Requirements: R3.2
 */
export function spellEmailForTTS(email: string): string {
  if (!email || typeof email !== 'string') {
    return '';
  }

  // First, replace special characters with words
  let processed = email
    .replace('@', ' at ')
    .replace(/\./g, ' dot ')
    .replace(/\+/g, ' plus ')
    .replace(/-/g, ' dash ')
    .replace(/_/g, ' underscore ');

  // Split into parts, preserving the special words
  const parts = processed.split(/(\s+(?:at|dot|plus|dash|underscore)\s+)/);
  
  const result = parts.map(part => {
    // If this is a special word (at, dot, plus, dash, underscore), keep it as is
    if (/^\s*(at|dot|plus|dash|underscore)\s*$/.test(part)) {
      return part.trim();
    }
    
    // Otherwise, spell out the characters, handling numbers specially
    const chars = part.split('').filter(char => char !== ' ');
    const spelledChars: string[] = [];
    
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      
      if (/\d/.test(char)) {
        // For numbers, add space before if previous char was a letter
        if (i > 0 && /[a-zA-Z]/.test(chars[i - 1])) {
          spelledChars.push(' ' + char);
        } else {
          spelledChars.push(char);
        }
        
        // Add dash after number if next char is a number
        if (i < chars.length - 1 && /\d/.test(chars[i + 1])) {
          spelledChars.push('-');
        }
        // Add space after number if next char is a letter
        else if (i < chars.length - 1 && /[a-zA-Z]/.test(chars[i + 1])) {
          spelledChars.push(' ');
        }
      } else {
        // For letters, just add the character
        spelledChars.push(char);
        
        // Add dash after letter if next char is a letter
        if (i < chars.length - 1 && /[a-zA-Z]/.test(chars[i + 1])) {
          spelledChars.push('-');
        }
      }
    }
    
    return spelledChars.join('');
  }).filter(part => part.length > 0);

  // Join parts and add double spaces around special words for TTS pauses
  let finalResult = result.join(' ');
  
  // Add double spaces around special words for TTS pauses
  finalResult = finalResult
    .replace(/\bat\b/g, '  at  ')
    .replace(/\bdot\b/g, '  dot  ')
    .replace(/\bplus\b/g, '  plus  ')
    .replace(/\bdash\b/g, '  dash  ')
    .replace(/\bunderscore\b/g, '  underscore  ');
  
  // Clean up multiple spaces but preserve double spaces around special words
  return finalResult.replace(/\s{3,}/g, '  ').trim();
}

/**
 * Format complete address for TTS with natural pauses between components
 * 
 * Requirements: R3.1, R3.3
 */
export function formatAddressForTTS(address: AddressData): string {
  if (!address || typeof address !== 'object') {
    return '';
  }

  const parts: string[] = [];

  // Add street address
  if (address.street) {
    parts.push(address.street);
  }

  // Add unit number if present (use as-is for address formatting)
  if (address.unitNumber) {
    parts[parts.length - 1] += `, ${address.unitNumber}`;
  }

  // Add city
  if (address.city) {
    parts.push(address.city);
  }

  // Add state (use state code for brevity in address formatting)
  if (address.state) {
    parts.push(address.state);
  }

  // Add ZIP code (formatted for digit-by-digit spelling)
  if (address.zipCode) {
    const formattedZip = formatZipForTTS(address.zipCode);
    if (formattedZip) {
      parts.push(formattedZip);
    }
  }

  return parts.join(', ');
}

/**
 * Format state code to full state name for clarity
 * 
 * Requirements: R3.1
 */
export function formatStateForTTS(stateCode: string): string {
  if (!stateCode || typeof stateCode !== 'string') {
    return '';
  }

  const stateNames: { [key: string]: string } = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
    'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
    'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
    'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
    'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
    'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
    'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
    'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
    'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'
  };

  const upperCode = stateCode.toUpperCase();
  return stateNames[upperCode] || stateCode;
}

/**
 * Format unit number for clear TTS pronunciation
 * 
 * Requirements: R3.1, R3.3
 */
export function formatUnitNumberForTTS(unitNumber: string): string {
  if (!unitNumber || typeof unitNumber !== 'string') {
    return '';
  }

  let formatted = unitNumber.trim();

  // Expand common abbreviations for clarity
  formatted = formatted
    .replace(/^apt\s+/i, 'Apartment ')
    .replace(/^apartment\s+/i, 'Apartment ')
    .replace(/^ste\s+/i, 'Suite ')
    .replace(/^suite\s+/i, 'Suite ')
    .replace(/^unit\s+/i, 'Unit ')
    .replace(/^bldg\s+/i, 'Building ')
    .replace(/^building\s+/i, 'Building ')
    .replace(/^fl\s+/i, 'Floor ')
    .replace(/^floor\s+/i, 'Floor ')
    .replace(/^#\s*/i, 'Number ');

  return formatted;
}

/**
 * Format address confirmation prompt for TTS readback
 * 
 * Requirements: R3.4
 */
export function formatAddressConfirmationForTTS(address: AddressData): string {
  if (!address || typeof address !== 'object') {
    return '';
  }

  const formattedAddress = formatAddressForTTS(address);
  
  if (!formattedAddress) {
    return '';
  }

  return `Your mailing address is ${formattedAddress}. Is that correct?`;
}