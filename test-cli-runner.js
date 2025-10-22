#!/usr/bin/env node

// Simple CLI runner for tests
const { spawn } = require('child_process');
const path = require('path');

const cliPath = process.argv[2];
const args = process.argv.slice(3);

// Use tsx to run the TypeScript file
const child = spawn('node', ['node_modules/tsx/dist/cli.mjs', cliPath, ...args], {
  stdio: 'inherit',
  env: process.env
});

child.on('close', (code) => {
  process.exit(code);
});

child.on('error', (error) => {
  console.error('Error running CLI:', error);
  process.exit(1);
});