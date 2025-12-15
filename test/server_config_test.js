import { strict as assert } from 'assert';
import { resolvePort, DEFAULT_PORT } from '../server/config.js';

console.log('--- Starting Server Config Tests ---');

function testDefaults() {
  const port = resolvePort({});
  assert.equal(port, DEFAULT_PORT, 'Empty env should return default port');
  console.log('✅ Default port is used when env is empty');
}

function testPortEnv() {
  const port = resolvePort({ PORT: '3000' });
  assert.equal(port, 3000, 'PORT env should be respected');
  console.log('✅ PORT env variable is used when valid');
}

function testFlyInternalPort() {
  const port = resolvePort({ FLY_INTERNAL_PORT: '15000' });
  assert.equal(port, 15000, 'FLY_INTERNAL_PORT is used when PORT is missing');
  console.log('✅ FLY_INTERNAL_PORT is used as a fallback');
}

function testInvalidPort() {
  const port = resolvePort({ PORT: 'not-a-number', FLY_INTERNAL_PORT: '-1' });
  assert.equal(port, DEFAULT_PORT, 'Invalid ports fall back to default');
  console.log('✅ Invalid env values fall back to default port');
}

try {
  testDefaults();
  testPortEnv();
  testFlyInternalPort();
  testInvalidPort();
  console.log('--- All Server Config Tests Passed ---');
} catch (err) {
  console.error('Server config tests failed:', err);
  process.exit(1);
}
