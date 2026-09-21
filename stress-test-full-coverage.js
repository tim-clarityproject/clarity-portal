import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://portal.theclarityproject.co.uk';
const SCREENSHOT_DIR = './stress-test-full-coverage-failures';

// Every page on the website
const ALL_PAGES = [
  // Grow workflow
  { name: 'Grow Step 1: Goal', route: '/grow-step-1', section: 'Grow' },
  { name: 'Grow Step 2: Constraints', route: '/grow-step-2', section: 'Grow' },
  { name: 'Grow Step 3: Options', route: '/grow-step-3', section: 'Grow' },
  { name: 'Grow Step 3b: Prioritize', route: '/grow-step-3b-prioritize', section: 'Grow' },
  { name: 'Grow Step 4: Will Do', route: '/grow-step-4-will-do', section: 'Grow' },

  // Inversion workflow
  { name: 'Inversion Step 1: Goal', route: '/inversion-step-1', section: 'Inversion' },
  { name: 'Inversion Step 2: Fuckups', route: '/inversion-step-2', section: 'Inversion' },
  { name: 'Inversion Step 3: Plan', route: '/inversion-step-3', section: 'Inversion' },

  // Strategic Alignment workflow
  { name: 'Goal Setting', route: '/goal-setting', section: 'Strategic Alignment' },
  { name: 'Risks Assessment', route: '/risks-assessment', section: 'Strategic Alignment' },
  { name: 'Critical Success Factors', route: '/critical-success-factors', section: 'Strategic Alignment' },
  { name: 'Strategies', route: '/strategies', section: 'Strategic Alignment' },
  { name: 'Project List', route: '/project-list', section: 'Strategic Alignment' },
  { name: 'Project Matrix', route: '/project-matrix', section: 'Strategic Alignment' },
  { name: 'Project Progress', route: '/project-progress', section: 'Strategic Alignment' },

  // Other decision tools
  { name: 'Plan My Day', route: '/plan-my-day', section: 'Planning' },
  { name: 'Plan Meeting', route: '/plan-meeting', section: 'Planning' },
  { name: 'Tough Conversation Step 1', route: '/tough-conversation-step-1', section: 'Tools' },
  { name: 'If-Then Planning', route: '/if-then-planning', section: 'Tools' },
  { name: 'Stop-Doing Audit', route: '/stop-doing-audit', section: 'Tools' },

  // Reviews and History
  { name: 'My Journal/Reviews', route: '/my-journal', section: 'Journal' },
  { name: 'Decision History', route: '/decision-history', section: 'History' },
  { name: 'Decision Tools Hub', route: '/decision-tools', section: 'Hub' },

  // Other pages
  { name: 'Home/Welcome', route: '/', section: 'Navigation' },
  { name: 'Breathing Tool', route: '/breathe', section: 'Tools' },
];

let bugs = [];
let passCount = 0;
let failCount = 0;
let testResults = {};

async function randomDelay(min = 50, max = 300) {
  const delay = Math.random() * (max - min) + min;
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function captureFailure(page, testName, error) {
  failCount++;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}-${testName.replace(/\s+/g, '-')}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);

  try {
    await page.screenshot({ path: filepath, fullPage: true });
  } catch (e) {
    // Silent
  }

  const bug = {
    timestamp: new Date().toISOString(),
    testName,
    error: error.message || String(error),
    url: page.url(),
    screenshot: filename,
  };
  bugs.push(bug);
  console.log(`  ❌ ${testName}: ${error.message || String(error)}`);
}

async function testPageComprehensive(browser, pageInfo, iteration) {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);

  const testName = `${pageInfo.name} [Run ${iteration}]`;

  try {
    console.log(`  📄 ${testName}`);
    const startTime = Date.now();

    // Navigate to page
    await page.goto(`${BASE_URL}${pageInfo.route}`, { waitUntil: 'domcontentloaded' });
    const loadTime = Date.now() - startTime;

    // Check page loaded
    const currentUrl = page.url();
    const urlMatches = currentUrl.includes(pageInfo.route.split('/')[1]) || pageInfo.route === '/';

    if (!urlMatches) {
      throw new Error(`URL mismatch: expected ${pageInfo.route}, got ${currentUrl}`);
    }

    // Test 1: Page elements exist
    const textareas = page.locator('textarea');
    const inputs = page.locator('input[type="text"]');
    const buttons = page.locator('button');
    const headings = page.locator('h1, h2');

    const elemCount = await textareas.count() + await inputs.count() + await buttons.count();

    if (elemCount === 0 && pageInfo.route !== '/') {
      console.log(`     ⚠️ No interactive elements found`);
    }

    // Test 2: Try to fill first textarea/input
    if (await textareas.count() > 0) {
      const testText = `Stress test iteration ${iteration} - ${Date.now()}`;
      await textareas.first().fill(testText);
      const filled = await textareas.first().inputValue();
      if (filled !== testText) {
        throw new Error('Input value mismatch after fill');
      }
      console.log(`     ✓ Textarea fillable`);
    } else if (await inputs.count() > 0) {
      await inputs.first().fill('Test input');
      console.log(`     ✓ Input fillable`);
    }

    // Test 3: Check for console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await randomDelay(200, 400);

    if (consoleErrors.length > 0) {
      console.log(`     ⚠️ Console errors: ${consoleErrors.slice(0, 2).join(', ')}`);
    }

    // Test 4: Button functionality
    const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
    if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const isEnabled = await continueBtn.isEnabled({ timeout: 1000 }).catch(() => false);
      console.log(`     ✓ Continue button ${isEnabled ? 'enabled' : 'disabled (expected)'}`);
    }

    // Test 5: Check page height and content
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    if (pageHeight < 300) {
      console.log(`     ⚠️ Short page (${pageHeight}px)`);
    }

    passCount++;
    console.log(`     ✅ Pass (${loadTime}ms load)`);

    // Track results
    if (!testResults[pageInfo.name]) {
      testResults[pageInfo.name] = { passed: 0, failed: 0 };
    }
    testResults[pageInfo.name].passed++;

  } catch (error) {
    await captureFailure(page, testName, error);
    if (!testResults[pageInfo.name]) {
      testResults[pageInfo.name] = { passed: 0, failed: 0 };
    }
    testResults[pageInfo.name].failed++;
  } finally {
    await page.close();
  }
}

async function runFullCoverageTest() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║    🚀 CLARITY PORTAL - FULL COVERAGE STRESS TEST                ║');
  console.log(`║       Every Page × 3 Iterations = ${ALL_PAGES.length * 3} Total Tests             ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`\n🎯 Target: ${BASE_URL}`);
  console.log(`📊 Total Pages: ${ALL_PAGES.length}`);
  console.log(`🔁 Iterations per Page: 3`);
  console.log(`📸 Failures: ${SCREENSHOT_DIR}\n`);

  // Test each page 3 times
  for (let iteration = 1; iteration <= 3; iteration++) {
    console.log(`\n${'═'.repeat(63)}`);
    console.log(`ITERATION ${iteration}/3`);
    console.log(`${'═'.repeat(63)}`);

    for (const pageInfo of ALL_PAGES) {
      await testPageComprehensive(browser, pageInfo, iteration);
      await randomDelay(150, 400);
    }
  }

  await browser.close();

  // Generate report
  generateReport();
}

function generateReport() {
  const totalTests = passCount + failCount;
  const passRate = totalTests > 0 ? ((passCount / totalTests) * 100).toFixed(1) : 0;

  // Group results by section
  const bySection = {};
  ALL_PAGES.forEach(page => {
    if (!bySection[page.section]) bySection[page.section] = [];
    bySection[page.section].push(page.name);
  });

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalTests,
      passed: passCount,
      failed: failCount,
      passRate: `${passRate}%`,
      totalPages: ALL_PAGES.length,
      iterationsPerPage: 3,
      url: BASE_URL,
    },
    pageResults: testResults,
    sections: bySection,
    bugs: bugs.length > 0 ? bugs : [],
  };

  const reportPath = './stress-test-full-coverage-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                  📊 FULL COVERAGE REPORT                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`\n✅ Passed: ${passCount}/${totalTests}`);
  console.log(`❌ Failed: ${failCount}/${totalTests}`);
  console.log(`📈 Pass Rate: ${passRate}%\n`);

  // Results by section
  console.log('📋 Results by Section:');
  console.log('─────────────────────────────────────────────────────────────');
  for (const [section, pages] of Object.entries(bySection)) {
    const sectionResults = pages.map(name => testResults[name] || { passed: 0, failed: 0 });
    const sectionPassed = sectionResults.reduce((sum, r) => sum + r.passed, 0);
    const sectionTotal = sectionResults.reduce((sum, r) => sum + r.passed + r.failed, 0);
    const pct = sectionTotal > 0 ? ((sectionPassed / sectionTotal) * 100).toFixed(0) : 0;
    const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
    console.log(`${section.padEnd(20)} ${bar} ${pct}% (${sectionPassed}/${sectionTotal})`);
  }

  // Individual page results
  console.log('\n📄 Individual Page Results:');
  console.log('─────────────────────────────────────────────────────────────');
  for (const [page, result] of Object.entries(testResults)) {
    const status = result.failed === 0 ? '✅' : '⚠️';
    console.log(`${status} ${page.padEnd(35)} ${result.passed}/3 passed`);
  }

  if (bugs.length > 0) {
    console.log(`\n🔴 FAILURES (${bugs.length}):`);
    console.log('─────────────────────────────────────────────────────────────');
    bugs.slice(0, 15).forEach((bug, idx) => {
      console.log(`\n${idx + 1}. ${bug.testName}`);
      console.log(`   Error: ${bug.error}`);
      console.log(`   URL: ${bug.url}`);
    });
    if (bugs.length > 15) {
      console.log(`\n... and ${bugs.length - 15} more failures`);
    }
  } else {
    console.log('\n✨ No failures! All pages working perfectly.');
  }

  console.log(`\n📄 Full report: ${reportPath}`);
  console.log(`📸 Screenshots: ${SCREENSHOT_DIR}\n`);
}

runFullCoverageTest().catch(console.error);
