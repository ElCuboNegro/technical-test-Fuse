/**
 * Zod Schemas for Contact Information Structured Extraction
 * 
 * Provides Zod schemas for validating and parsing address and email data
 * extracted from conversation text via LLM structured output.
 * 
 * Requirements: R1.1, R1.2, R1.3, R2.1, R2.2
 */

import { z } from 'zod';
import { validateState } from './address-validation';
import { validateEmail } from './email-validation';

/**
 * Address extraction schema with validation and coercion
 * 
 * Requirements: R1.1, R1.2, R1.3
 */
export const AddressExtract = z.object({
  street: z.string()
    .transform(val => val.trim())
    .refine(val => val.length > 0, {
      message: "Street address is required"
    }),
  
  city: z.string()
    .transform(val => val.trim())
    .refine(val => val.length > 0, {
      message: "City is required"
    }),
  
  state: z.string()
    .transform(val => val.toUpperCase().trim())
    .refine(val => val.length === 2, {
      message: "State must be 2-letter code"
    })
    .refine(validateState, {
      message: "Invalid US state code"
    }),
  
  zipCode: z.string()
    .transform(val => val.replace(/\s/g, ''))
    .refine(val => /^\d{5}(-\d{4})?$/.test(val), {
      message: "ZIP code must be 5 digits or 5+4 format"
    }),
  
  unitNumber: z.string()
    .transform(val => val?.trim() || undefined)
    .optional()
});

/**
 * Email extraction schema with optional handling
 * 
 * Requirements: R2.1, R2.2
 */
export const EmailExtract = z.object({
  email: z.string()
    .transform(val => val.trim().toLowerCase())
    .refine(val => validateEmail(val), {
      message: "Invalid email format"
    })
    .optional()
});

/**
 * Combined contact extraction schema
 * 
 * Requirements: R1.1, R1.2, R1.3, R2.1, R2.2
 */
export const ContactExtract = z.object({
  address: AddressExtract,
  email: z.string()
    .transform(val => val.trim().toLowerCase())
    .refine(val => validateEmail(val), {
      message: "Invalid email format"
    })
    .optional()
});

/**
 * Type definitions for extracted data
 */
export type AddressExtractType = z.infer<typeof AddressExtract>;
export type EmailExtractType = z.infer<typeof EmailExtract>;
export type ContactExtractType = z.infer<typeof ContactExtract>;

/**
 * Schema validation with proper error handling
 * 
 * Requirements: R1.1, R1.2, R2.1, R2.2
 */
export function validateAddressData(data: unknown): {
  success: boolean;
  data?: AddressExtractType;
  errors?: string[];
} {
  try {
    const result = AddressExtract.parse(data);
    return {
      success: true,
      data: result
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }
    return {
      success: false,
      errors: ['Unknown validation error']
    };
  }
}

/**
 * Email schema validation with proper error handling
 * 
 * Requirements: R2.1, R2.2
 */
export function validateEmailData(data: unknown): {
  success: boolean;
  data?: EmailExtractType;
  errors?: string[];
} {
  try {
    const result = EmailExtract.parse(data);
    return {
      success: true,
      data: result
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }
    return {
      success: false,
      errors: ['Unknown validation error']
    };
  }
}

/**
 * Schema coercion utilities for consistent data formatting
 * 
 * Requirements: R1.1, R1.2, R2.2
 */
export const SchemaCoercion = {
  /**
   * Coerce address data with fallback handling
   */
  coerceAddress: (data: any): Partial<AddressExtractType> => {
    const coerced: any = {};
    
    if (data.street !== undefined && data.street !== null) coerced.street = String(data.street).trim();
    if (data.city !== undefined && data.city !== null) coerced.city = String(data.city).trim();
    if (data.state !== undefined && data.state !== null) coerced.state = String(data.state).toUpperCase().trim();
    if (data.zipCode !== undefined && data.zipCode !== null) coerced.zipCode = String(data.zipCode).replace(/\s/g, '');
    if (data.unitNumber !== undefined && data.unitNumber !== null) coerced.unitNumber = String(data.unitNumber).trim();
    
    return coerced;
  },

  /**
   * Coerce email data with normalization
   */
  coerceEmail: (data: any): Partial<EmailExtractType> => {
    if (!data?.email) return {};
    
    return {
      email: String(data.email).trim().toLowerCase()
    };
  }
};