#!/usr/bin/env tsx

/**
 * Configuration Management Demo
 * 
 * This script demonstrates the database configuration management functionality
 * implemented for task 1.3. It shows how to:
 * 
 * - Load and validate environment variables
 * - Detect database environments
 * - Validate database connections
 * - Handle environment-specific configurations
 * 
 * Requirements demonstrated:
 * - 6.1: Support TEST_DATABASE_URL and DATABASE_URL environment variables
 * - 6.2: Fall back to DATABASE_URL when TEST_DATABASE_URL is not set
 * - 6.3: Validate database environment before operations
 * - 6.5: Provide clear logging of database environment usage
 */

import { ConfigurationManager, DatabaseValidator, detectEnvironment } from '../interfaces/index';

async function demonstrateConfigurationManagement() {
    console.log('='.repeat(60));
    console.log('Database Configuration Management Demo');
    console.log('='.repeat(60));

    try {
        // 1. Initialize Configuration Manager
        console.log('\n1. Initializing Configuration Manager...');
        const configManager = new ConfigurationManager();
        console.log('✓ Configuration Manager initialized successfully');

        // 2. Validate Environment Variables
        console.log('\n2. Validating Environment Variables...');
        const validation = configManager.validateEnvironmentVariables();

        if (validation.isValid) {
            console.log('✓ All required environment variables are present');
        } else {
            console.log('✗ Environment validation failed:');
            validation.errors.forEach(error => console.log(`  - ${error}`));
        }

        if (validation.warnings && validation.warnings.length > 0) {
            console.log('⚠ Warnings:');
            validation.warnings.forEach(warning => console.log(`  - ${warning}`));
        }

        // 3. Get Database URLs for Different Environments
        console.log('\n3. Database URL Configuration...');

        try {
            const testUrl = configManager.getDatabaseUrl('test');
            console.log(`Test Database URL: ${maskUrl(testUrl)}`);

            const prodUrl = configManager.getDatabaseUrl('production');
            console.log(`Production Database URL: ${maskUrl(prodUrl)}`);
        } catch (error) {
            console.error(`Error getting database URLs: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // 4. Environment Detection
        console.log('\n4. Environment Detection...');

        const testUrl = configManager.getDatabaseUrl('test');
        const prodUrl = configManager.getDatabaseUrl('production');

        console.log('Test URL Detection:');
        const testDetection = detectEnvironment(testUrl);
        console.log(`  Environment: ${testDetection.environment}`);
        console.log(`  Confidence: ${testDetection.confidence}`);
        console.log(`  Indicators: ${testDetection.indicators.join(', ')}`);
        if (testDetection.warnings.length > 0) {
            console.log(`  Warnings: ${testDetection.warnings.join(', ')}`);
        }

        console.log('\nProduction URL Detection:');
        const prodDetection = detectEnvironment(prodUrl);
        console.log(`  Environment: ${prodDetection.environment}`);
        console.log(`  Confidence: ${prodDetection.confidence}`);
        console.log(`  Indicators: ${prodDetection.indicators.join(', ')}`);
        if (prodDetection.warnings.length > 0) {
            console.log(`  Warnings: ${prodDetection.warnings.join(', ')}`);
        }

        // 5. Environment Configuration
        console.log('\n5. Environment Configuration...');

        const testConfig = configManager.getEnvironmentConfig('test');
        console.log(`Test Environment Config:`);
        console.log(`  Environment: ${testConfig.environment}`);
        console.log(`  Database URL: ${maskUrl(testConfig.databaseUrl)}`);
        console.log(`  Is Test Environment: ${testConfig.isTestEnvironment}`);

        const prodConfig = configManager.getEnvironmentConfig('production');
        console.log(`\nProduction Environment Config:`);
        console.log(`  Environment: ${prodConfig.environment}`);
        console.log(`  Database URL: ${maskUrl(prodConfig.databaseUrl)}`);
        console.log(`  Is Test Environment: ${prodConfig.isTestEnvironment}`);

        // 6. Hashing Salts
        console.log('\n6. Hashing Salts Configuration...');
        const salts = configManager.getHashingSalts();
        console.log(`SSN Salt: ${salts.ssnSalt ? '***' : 'Not set'}`);
        console.log(`DOB Salt: ${salts.dobSalt ? '***' : 'Not set'}`);

        // 7. Database Validation (if possible)
        console.log('\n7. Database Connection Validation...');
        const validator = new DatabaseValidator();

        try {
            console.log('Testing database connection...');
            const connectionValid = await validator.validateConnection(testUrl);

            if (connectionValid) {
                console.log('✓ Database connection successful');

                // Test schema validation
                console.log('Testing schema validation...');
                const schemaResult = await validator.validateSchema();

                if (schemaResult.tablesExist && schemaResult.indexesExist && schemaResult.columnsValid) {
                    console.log('✓ Database schema validation passed');
                } else {
                    console.log('⚠ Database schema validation issues:');
                    schemaResult.missingElements.forEach(element => {
                        console.log(`  - Missing: ${element}`);
                    });
                }
            } else {
                console.log('✗ Database connection failed');
            }
        } catch (error) {
            console.log(`Database validation skipped: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        console.log('\n' + '='.repeat(60));
        console.log('Configuration Management Demo Complete');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n✗ Demo failed:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    }
}

/**
 * Mask sensitive parts of database URL for safe logging
 */
function maskUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        const maskedPassword = urlObj.password ? '***' : '';
        return `${urlObj.protocol}//${urlObj.username}:${maskedPassword}@${urlObj.host}${urlObj.pathname}`;
    } catch {
        return url.replace(/:[^:@]+@/, ':***@');
    }
}

// Run the demo if this file is executed directly
if (require.main === module) {
    demonstrateConfigurationManagement().catch(console.error);
}