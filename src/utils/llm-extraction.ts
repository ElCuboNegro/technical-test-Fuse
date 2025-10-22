/**
 * LLM-based Structured Extraction Utilities
 * 
 * Provides utilities for extracting structured data from conversation text
 * using LLM with Zod schema validation.
 * 
 * Requirements: R1.1, R1.2, R1.3, R2.1, R2.2
 */

import { z } from 'zod';

export interface ExtractionResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
  warnings?: string[];
}

export interface ExtractionOptions {
  systemHint?: string;
  fewShot?: Array<{ user: string; assistant: string }>;
  maxRetries?: number;
}

/**
 * Extract structured data from text using LLM with Zod schema validation
 * 
 * Requirements: R1.1, R1.2, R2.1, R2.2
 */
export async function extractWithSchema<T>(
  text: string,
  schema: z.ZodSchema<T>,
  options: ExtractionOptions = {}
): Promise<ExtractionResult<T>> {
  const {
    systemHint = 'Extract structured data from the provided text.',
    fewShot = [],
    maxRetries = 2
  } = options;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return {
      success: false,
      errors: ['Input text is required']
    };
  }

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // For now, we'll simulate LLM extraction with a simple parser
      // In a real implementation, this would call an LLM service
      const extractedData = await simulateLLMExtraction(text, systemHint, fewShot);
      
      // Validate with Zod schema
      const result = schema.safeParse(extractedData);
      
      if (result.success) {
        return {
          success: true,
          data: result.data
        };
      } else {
        const errors = result.error.errors.map(err => 
          `${err.path.join('.')}: ${err.message}`
        );
        
        if (attempt === maxRetries) {
          return {
            success: false,
            errors
          };
        }
        
        // Continue to next attempt
        lastError = new Error(`Validation failed: ${errors.join(', ')}`);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown extraction error');
      
      if (attempt === maxRetries) {
        return {
          success: false,
          errors: [lastError.message]
        };
      }
    }
  }

  return {
    success: false,
    errors: [lastError?.message || 'Extraction failed after all retries']
  };
}

/**
 * Simulate LLM extraction for development/testing
 * In production, this would be replaced with actual LLM API calls
 * 
 * Requirements: R1.1, R1.2, R2.1, R2.2
 */
async function simulateLLMExtraction(
  text: string,
  systemHint: string,
  fewShot: Array<{ user: string; assistant: string }>
): Promise<any> {
  // Simple pattern matching for common address and email patterns
  const result: any = {};
  
  // Extract email
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  if (emailMatch) {
    result.email = emailMatch[0];
  }
  
  // Extract ZIP code
  const zipMatch = text.match(/\b\d{5}(-\d{4})?\b/);
  if (zipMatch) {
    result.zipCode = zipMatch[0];
  }
  
  // Extract state (2-letter codes)
  const stateMatch = text.match(/\b[A-Z]{2}\b/);
  if (stateMatch) {
    result.state = stateMatch[0];
  }
  
  // Extract street address (simple heuristic)
  const streetMatch = text.match(/\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Place|Pl|Court|Ct)\b/i);
  if (streetMatch) {
    result.street = streetMatch[0];
  }
  
  // Extract city (heuristic: capitalized words before state/zip)
  const cityMatch = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*,?\s*[A-Z]{2}\b/);
  if (cityMatch) {
    result.city = cityMatch[1];
  }
  
  // Extract unit number
  const unitMatch = text.match(/(?:apt|apartment|suite|ste|unit|#)\s*([A-Za-z0-9]+)/i);
  if (unitMatch) {
    result.unitNumber = unitMatch[1];
  }
  
  return result;
}

/**
 * Extract address data specifically from conversation text
 * 
 * Requirements: R1.1, R1.2, R1.3
 */
export async function extractAddressFromText(
  text: string,
  options: ExtractionOptions = {}
): Promise<ExtractionResult<any>> {
  const systemHint = options.systemHint || 
    'Extract address components (street, city, state, zipCode, unitNumber) from the conversation text. Return as JSON.';
  
  return extractWithSchema(text, z.any(), { ...options, systemHint });
}

/**
 * Extract email data specifically from conversation text
 * 
 * Requirements: R2.1, R2.2
 */
export async function extractEmailFromText(
  text: string,
  options: ExtractionOptions = {}
): Promise<ExtractionResult<any>> {
  const systemHint = options.systemHint || 
    'Extract email address from the conversation text. Return as JSON with email field.';
  
  return extractWithSchema(text, z.any(), { ...options, systemHint });
}