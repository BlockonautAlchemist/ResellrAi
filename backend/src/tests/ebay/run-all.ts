/**
 * eBay Tests Runner
 *
 * Runs all eBay integration tests in sequence.
 * Run with: npx tsx src/tests/ebay/run-all.ts
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tests = [
  'token-crypto.test.ts',
  'auth.test.ts',
  'comps.test.ts',
  'listing.test.ts',
  'integration.test.ts',
];

console.log('╔═══════════════════════════════════════════╗');
console.log('║       Running All eBay Tests              ║');
console.log('╚═══════════════════════════════════════════╝\n');

let totalPassed = 0;
let totalFailed = 0;

for (const test of tests) {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Running: ${test}`);
  console.log('═'.repeat(50));

  try {
    execSync(`npx tsx ${path.join(__dirname, test)}`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..', '..', '..'),
    });
    totalPassed++;
  } catch (error) {
    totalFailed++;
    console.error(`\n❌ Test file ${test} had failures\n`);
  }
}

console.log('\n' + '═'.repeat(50));
console.log('FINAL SUMMARY');
console.log('═'.repeat(50));
console.log(`Test files passed: ${totalPassed}/${tests.length}`);
console.log(`Test files failed: ${totalFailed}/${tests.length}`);
console.log('═'.repeat(50));

if (totalFailed > 0) {
  process.exit(1);
}
