#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && full.endsWith('.js')) files.push(full);
  }
}
walk(root);
let failed = 0;
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed += 1;
    const relative = path.relative(root, file);
    process.stderr.write("\nSyntax error in " + relative + "\n");
    process.stderr.write((result.stderr || result.stdout || "node --check failed") + "\n");
  }
}
if (failed) {
  process.stderr.write(`\nSyntax check failed: ${failed} file(s).\n`);
  process.exit(1);
}
console.log(`Syntax OK: ${files.length} JavaScript files`);
