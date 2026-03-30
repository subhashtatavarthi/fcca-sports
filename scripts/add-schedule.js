#!/usr/bin/env node
/**
 * FCCA Add Schedule Script
 * Usage: npm run add-schedule -- "path/to/YourSchedule.xlsx" "April 2026"
 *
 * This copies the file into public/schedules/ and registers it in manifest.json
 * so ALL visitors to the live site can see it.
 *
 * After running this script, commit and push:
 *   git add . && git commit -m "add April 2026 schedule" && git push
 */

const fs   = require('fs');
const path = require('path');

const src   = process.argv[2];
const label = process.argv[3] || '';

if (!src) {
  console.error('\n❌  Usage: npm run add-schedule -- "path/to/file.xlsx" "April 2026"\n');
  process.exit(1);
}

const absSource = path.resolve(src);
if (!fs.existsSync(absSource)) {
  console.error(`\n❌  File not found: ${absSource}\n`);
  process.exit(1);
}

const schedDir  = path.join(__dirname, '..', 'public', 'schedules');
const manifPath = path.join(schedDir, 'manifest.json');

// Slugify filename for URL safety
const slug      = path.basename(absSource).replace(/\s+/g, '_');
const destPath  = path.join(schedDir, slug);

// Copy the file
fs.copyFileSync(absSource, destPath);
console.log(`✅  Copied → public/schedules/${slug}`);

// Read / update manifest
const manifest = JSON.parse(fs.readFileSync(manifPath, 'utf8'));

// Check for duplicate filename and replace if found
const existingIdx = manifest.schedules.findIndex(s => s.file === slug);
const entry = {
  id:         Date.now().toString(),
  file:       slug,
  label:      label || path.basename(absSource, path.extname(absSource)),
  addedAt:    new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }),
};

if (existingIdx >= 0) {
  manifest.schedules[existingIdx] = entry;
  console.log(`♻️   Updated existing entry: ${entry.label}`);
} else {
  manifest.schedules.unshift(entry); // newest first
  console.log(`➕  Added new entry: ${entry.label}`);
}

fs.writeFileSync(manifPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`📄  Updated public/schedules/manifest.json (${manifest.schedules.length} schedule(s))\n`);
console.log('Next steps:');
console.log('  git add . && git commit -m "add schedule: ' + entry.label + '" && git push\n');
console.log('GitHub will redeploy in ~2 min and everyone will see the new schedule.\n');
