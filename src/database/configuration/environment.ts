import { ConfigurationManager } from './manager';

/**
 * Environment detection and validation utilities
 * 
 * Requirements addressed:
 * - 6.3: Validate database environment before operations
 * - 6.5: Provide clear logging of database environment usage
 */

export interface EnvironmentDetectionResult {
  environment: 'test' | 'production';
  confidence: 'high' | 'medium' | 'low';
  indicators: string[];
  warnings: string[];
}

/**
 * Detect environment type based on database URL and other indicators
 */
export function detectEnvironment(databaseUrl: string): EnvironmentDetectionResult {
  const testIndicators: string[] = [];
  const warnings: string[] = [];
  
  const urlLower = databaseUrl.toLowerCase();
  
  // Strong test indicators
  const strongTestIndicators = [
    '_test',
    'test_', 
    'testing',
    'localhost:5433',
    '127.0.0.1:5433'
  ];
  
  // Weak test indicators
  const weakTestIndicators = [
    'localhost',
    '127.0.0.1',
    ':5433'
  ];
  
  // Production indicators
  const productionIndicators = [
    'prod',
    'production',
    '.amazonaws.com',
    '.rds.',
    ':5432' // Default PostgreSQL port
  ];
  
  // Check for strong test indicators
  strongTestIndicators.forEach(indicator => {
    if (urlLower.includes(indicator)) {
      testIndicators.push(`Strong test indicator: ${indicator}`);
    }
  });
  
  // Check for weak test indicators
  weakTestIndicators.forEach(indicator => {
    if (urlLower.includes(indicator) && !testIndicators.some(ti => ti.includes(indicator))) {
      testIndicators.push(`Weak test indicator: ${indicator}`);
    }
  });
  
  // Check for production indicators
  const foundProductionIndicators: string[] = [];
  productionIndicators.forEach(indicator => {
    if (urlLower.includes(indicator)) {
      foundProductionIndicators.push(indicator);
    }
  });
  
  // Determine environment and confidence
  let environment: 'test' | 'production';
  let confidence: 'high' | 'medium' | 'low';
  
  const hasStrongTestIndicators = testIndicators.some(ti => ti.includes('Strong'));
  const hasWeakTestIndicators = testIndicators.some(ti => ti.includes('Weak'));
  const hasProductionIndicators = foundProductionIndicators.length > 0;
  
  if (hasStrongTestIndicators) {
    environment = 'test';
    confidence = 'high';
  } else if (hasWeakTestIndicators && !hasProductionIndicators) {
    environment = 'test';
    confidence = 'medium';
    warnings.push('Environment detection based on weak indicators only');
  } else if (hasProductionIndicators && !hasWeakTestIndicators) {
    environment = 'production';
    confidence = 'high';
  } else if (hasProductionIndicators && hasWeakTestIndicators) {
    environment = 'production';
    confidence = 'low';
    warnings.push('Conflicting environment indicators detected');
  } else {
    environment = 'production';
    confidence = 'low';
    warnings.push('No clear environment indicators found, defaulting to production');
  }
  
  return {
    environment,
    confidence,
    indicators: [...testIndicators, ...foundProductionIndicators.map(pi => `Production indicator: ${pi}`)],
    warnings
  };
}

/**
 * Validate environment safety for operations
 */
export function validateEnvironmentSafety(
  intendedEnvironment: 'test' | 'production',
  databaseUrl: string
): { safe: boolean; warnings: string[]; errors: string[] } {
  const detection = detectEnvironment(databaseUrl);
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // Add detection warnings
  warnings.push(...detection.warnings);
  
  // Check for environment mismatch
  if (intendedEnvironment !== detection.environment) {
    if (intendedEnvironment === 'test' && detection.environment === 'production') {
      errors.push(`Attempting to use test operations on production database (${databaseUrl})`);
    } else if (intendedEnvironment === 'production' && detection.environment === 'test') {
      warnings.push(`Using production operations on test database (${databaseUrl})`);
    }
  }
  
  // Check confidence level
  if (detection.confidence === 'low') {
    warnings.push(`Low confidence in environment detection for ${databaseUrl}`);
  }
  
  return {
    safe: errors.length === 0,
    warnings,
    errors
  };
}

/**
 * Get environment-specific configuration with validation
 */
export async function getValidatedEnvironmentConfig(environment: 'test' | 'production') {
  const configManager = new ConfigurationManager();
  const config = configManager.getEnvironmentConfig(environment);
  
  // Validate environment safety
  const safety = validateEnvironmentSafety(environment, config.databaseUrl);
  
  if (!safety.safe) {
    throw new Error(`Environment validation failed: ${safety.errors.join(', ')}`);
  }
  
  // Log warnings
  if (safety.warnings.length > 0) {
    console.warn('Environment validation warnings:');
    safety.warnings.forEach(warning => console.warn(`  - ${warning}`));
  }
  
  // Log environment detection results
  const detection = detectEnvironment(config.databaseUrl);
  console.log(`Environment Detection Results:
  Intended: ${environment}
  Detected: ${detection.environment}
  Confidence: ${detection.confidence}
  Indicators: ${detection.indicators.join(', ')}`);
  
  return config;
}