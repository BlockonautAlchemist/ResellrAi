/**
 * Run All Handshake Tests
 * 
 * Executes all handshake tests in sequence and reports results.
 */

import { runSupabaseTests } from './supabase.test.js';
import { runOpenRouterTests } from './openrouter.test.js';
import { runPipelineTest } from './pipeline.test.js';

async function runAllTests(): Promise<void> {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║         ResellrAI Handshake Test Suite                ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Running all connectivity and integration tests...\n');
  
  const results: Record<string, boolean> = {
    supabase: false,
    openrouter: false,
    pipeline: false,
  };
  
  // Test 1: Supabase
  console.log('━'.repeat(55));
  console.log('📦 SUPABASE TESTS');
  console.log('━'.repeat(55));
  try {
    results.supabase = await runSupabaseTests();
  } catch (err) {
    console.error('Supabase tests crashed:', err);
    results.supabase = false;
  }
  
  // Test 2: OpenRouter
  console.log('\n');
  console.log('━'.repeat(55));
  console.log('🤖 OPENROUTER TESTS');
  console.log('━'.repeat(55));
  try {
    results.openrouter = await runOpenRouterTests();
  } catch (err) {
    console.error('OpenRouter tests crashed:', err);
    results.openrouter = false;
  }
  
  // Test 3: Full Pipeline
  console.log('\n');
  console.log('━'.repeat(55));
  console.log('🔄 FULL PIPELINE TEST');
  console.log('━'.repeat(55));
  try {
    results.pipeline = await runPipelineTest();
  } catch (err) {
    console.error('Pipeline test crashed:', err);
    results.pipeline = false;
  }
  
  // Final Summary
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║                    TEST SUMMARY                       ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  
  const allPassed = Object.values(results).every((v) => v);
  
  Object.entries(results).forEach(([name, passed]) => {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    const paddedName = name.padEnd(20);
    console.log(`║  ${paddedName} ${status}                       ║`);
  });
  
  console.log('╠═══════════════════════════════════════════════════════╣');
  
  if (allPassed) {
    console.log('║  🎉 All tests passed! Ready for Phase 3.             ║');
  } else {
    console.log('║  ⚠️  Some tests failed. Fix issues before Phase 3.   ║');
  }
  
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');
  
  process.exit(allPassed ? 0 : 1);
}

runAllTests().catch((err) => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
