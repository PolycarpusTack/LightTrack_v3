#!/usr/bin/env node
/**
 * Run a command with environment variables set, in any shell (cmd, PowerShell, bash).
 *
 * Usage: node scripts/with-env.js NAME=value [NAME=value ...] <command> [args...]
 * Example: node scripts/with-env.js NODE_ENV=development electron .
 *
 * Commands are resolved from node_modules/.bin first, so local tools like electron work.
 */
const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const env = { ...process.env };

while (args.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(args[0])) {
  const [name, ...rest] = args.shift().split('=');
  env[name] = rest.join('=');
}

if (!args.length) {
  console.error('Usage: node scripts/with-env.js NAME=value <command> [args...]');
  process.exit(1);
}

const binDir = path.join(__dirname, '..', 'node_modules', '.bin');
const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') || 'PATH';
env[pathKey] = binDir + path.delimiter + (env[pathKey] || '');

// A shell is needed to run .cmd shims on Windows; it re-joins arguments, so quote any with spaces or quotes.
const quote = arg => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);
const child = spawn(args[0], args.slice(1).map(quote), { env, stdio: 'inherit', shell: true });
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0));
