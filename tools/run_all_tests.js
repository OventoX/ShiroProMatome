/**
 * Unified Test Runner for ShiroPro RE Helper Test Spec
 * Runs both Node whitebox suite and Puppeteer browser suite
 */
const { spawn } = require('child_process');
const path = require('path');

function runScript(scriptPath) {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [scriptPath], {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..')
    });
    proc.on('close', (code) => {
      resolve(code);
    });
  });
}

async function main() {
  console.log('=============================================================');
  console.log('SHIROPRO RE HELPER: COMPLETE TEST SPEC SUITE RUNNER');
  console.log('=============================================================\n');

  const t0 = Date.now();
  const whiteboxCode = await runScript(path.join(__dirname, 'test_whitebox.js'));
  if (whiteboxCode !== 0) {
    console.error('\n[FATAL] Whitebox test suite failed with exit code:', whiteboxCode);
    process.exit(whiteboxCode);
  }

  const browserCode = await runScript(path.join(__dirname, 'test_spec_browser.js'));
  if (browserCode !== 0) {
    console.error('\n[FATAL] Browser test suite failed with exit code:', browserCode);
    process.exit(browserCode);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n=============================================================');
  console.log(`ALL TEST SUITES PASSED SUCCESSFULLY in ${elapsed}s!`);
  console.log('=============================================================');
}

main().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
