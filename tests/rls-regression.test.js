const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrationDir = path.join(root, 'supabase', 'migrations');
const migration = fs.readdirSync(migrationDir)
  .filter(name => name.endsWith('_security_hardening.sql'))
  .sort()
  .at(-1);

test('RLS hardening migration exists and enforces a fail-closed public schema', () => {
  assert.ok(migration, 'missing RLS hardening migration');
  const sql = fs.readFileSync(path.join(migrationDir, migration), 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE/i);
  assert.match(sql, /GRANT SELECT ON TABLE/i);
  assert.match(sql, /CREATE POLICY public_read/i);
  assert.match(sql, /NOT c\.relrowsecurity/i);
  assert.match(sql, /RLS regression: one or more public tables have RLS disabled/i);
});
