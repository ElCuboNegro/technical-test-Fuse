# Database Migrations

This directory contains database migration files for the seeding system.

## Migration File Naming Convention

Migration files follow the pattern: `{version}_{name}.sql`

Example: `001_initial_schema.sql`

## Migration Structure

Each migration file contains:

- Version number (3-digit zero-padded)
- Descriptive name
- SQL statements for schema changes

## Rollback Files

Rollback files are stored in the `rollbacks/` subdirectory with the pattern:
`{version}_{name}_rollback.sql`

## Migration Order

Migrations are executed in version number order. Each migration must be idempotent and safe to run multiple times.
