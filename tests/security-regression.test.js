const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('no tracked environment file exists in the working tree', () => {
  for (const name of ['.env', '.env.local', '.env.production', '.env.development']) {
    assert.equal(fs.existsSync(path.join(root, name)), false, name + ' must never be committed');
  }
});

test('Edge ingestion authentication has no embedded token', () => {
  const source = fs.readFileSync(path.join(root, 'supabase', 'functions', 'observatory-external-ingest', 'index.ts'), 'utf8');
  assert.match(source, /observatory_ingest_credentials/);
  assert.match(source, /SHA-256/);
  assert.doesNotMatch(source, /const\s+TOKEN\s*=\s*['\"]/);
});

test('JWT authentication has no production fallback secret', () => {
  const source = fs.readFileSync(path.join(root, 'src', 'auth.js'), 'utf8');
  assert.match(source, /process\.env\.JWT_SECRET/);
  assert.doesNotMatch(source, /JWT_SECRET\s*\|\|\s*['"][^'"]+['"]/);
  assert.doesNotMatch(source, /change-me-in-production-use-64-char-random-string/);
});
