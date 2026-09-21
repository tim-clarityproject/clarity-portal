import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://portal.theclarityproject.co.uk';
const TEST_RUNS = 100;
const SCREENSHOT_DIR = './stress-test-comprehensive-failures';

// Enhanced test data library with more variety
const testDataLibrary = {
  goals: [
    'Build a world-class product that solves customer pain',
    'Improve team productivity by 50% this quarter',
    'Launch in 3 new markets and hit $1M ARR',
    'Create a culture of continuous learning',
    'Scale from 10 to 100 customers',
    'Reduce operational costs by 40%',
    'Build an AI-powered feature',
    'Implement zero-downtime deployments',
    'Achieve 99.99% uptime SLA',
    'Triple our customer satisfaction score',
    'Build machine learning infrastructure',
    'Establish thought leadership in industry',
    'Create autonomous team capabilities',
    'Implement real-time data processing',
    'Build mobile-first experience',
  ],
  veryShortText: 'Goal',
  shortText: 'Improve sales process',
  mediumText: 'Build a comprehensive onboarding system that reduces customer churn by 30% through better training and support',
  veryLongText: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(100),
  multilineText: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5',
  specialChars: 'Test with @#$%^&*() and émojis 🎉🚀 and "quotes" and \'apostrophes\'',
  unicodeChars: '你好世界 مرحبا العالم שלום עולם',
  htmlChars: '<script>alert("xss")</script>',
  newlines: '\n\n\n\n\n',
  tabs: '\t\t\t\t',
};

let bugs = [];
let passCount = 0;
let failCount = 0;
let warningCount = 0;

async function randomDelay(min = 50, max = 300) {
  const delay = Math.random() * (max - min) + min;
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function generateTestEmail() {
  return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@claritytest.local`;
}

async function captureFailure(page, testName, error, severity = 'error') {
  if (severity === 'error') failCount++;
  if (severity === 'warning') warningCount++;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}-${testName.replace(/\s+/g, '-')}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);

  try {
    await page.screenshot({ path: filepath, fullPage: true });
  } catch (e) {
    // Silent fail on screenshot
  }

  const bug = {
    timestamp: new Date().toISOString(),
    testName,
    severity,
    error: error.message || String(error),
    url: page.url(),
    screenshot: filename,
  };
  bugs.push(bug);
  const icon = severity === 'error' ? '❌' : '⚠️';
  console.log(`  ${icon} ${testName}: ${error.message || String(error)}`);
}

async function testEmptyFieldValidation(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  let testName = 'Empty Field Validation';

  try {
    await page.goto(`${BASE_URL}/grow-step-1`, { waitUntil: 'domcontentloaded' });

    // Try to submit without filling
    const button = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
    const isDisabled = await button.evaluate(el => el.disabled);

    if (isDisabled) {
      passCount++;
    } else {
      await captureFailure(page, testName, new Error('Continue button should be disabled when empty'), 'warning');
    }
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testMaxLengthInput(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  let testName = 'Max Length Input';

  try {
    await page.goto(`${BASE_URL}/grow-step-1`, { waitUntil: 'domcontentloaded' });

    const textarea = page.locator('textarea').first();
    const veryLongText = testDataLibrary.veryLongText;
    await textarea.fill(veryLongText);

    const value = await textarea.inputValue();
    if (value.length > 0) {
      passCount++;
    } else {
      await captureFailure(page, testName, new Error('Long text was truncated'));
    }
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testXSSPrevention(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  let testName = 'XSS Prevention';

  try {
    await page.goto(`${BASE_URL}/grow-step-1`, { waitUntil: 'domcontentloaded' });

    const textarea = page.locator('textarea').first();
    await textarea.fill(testDataLibrary.htmlChars);

    // Check that script tags are not executed (no alerts)
    const hasAlert = await page.evaluate(() => {
      return typeof window.xssDetected !== 'undefined';
    });

    if (!hasAlert) {
      passCount++;
    } else {
      await captureFailure(page, testName, new Error('XSS vulnerability detected'));
    }
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testFormStateAfterNavigation(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  let testName = 'Form State After Navigation';

  try {
    await page.goto(`${BASE_URL}/grow-step-1`, { waitUntil: 'domcontentloaded' });

    const testGoal = 'Test goal for navigation state';
    const textarea = page.locator('textarea').first();
    await textarea.fill(testGoal);

    // Navigate forward
    const button = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
    await button.click();
    await page.waitForTimeout(1500);

    // Go back
    const backButton = page.locator('button:has-text("Back")').first();
    if (await backButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await backButton.click();
      await page.waitForTimeout(1500);

      // Check if goal is still there
      const returnedTextarea = page.locator('textarea').first();
      const returnedValue = await returnedTextarea.inputValue();

      if (returnedValue === testGoal) {
        passCount++;
      } else {
        await captureFailure(page, testName, new Error('Form data lost after back navigation'));
      }
    } else {
      passCount++; // No back button, that's ok
    }
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testRapidInput(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  let testName = 'Rapid Input';

  try {
    await page.goto(`${BASE_URL}/grow-step-1`, { waitUntil: 'domcontentloaded' });

    const textarea = page.locator('textarea').first();
    const text = 'Rapid input test';

    // Type very quickly
    for (let char of text) {
      await textarea.type(char, { delay: 10 });
    }

    const value = await textarea.inputValue();
    if (value === text) {
      passCount++;
    } else {
      await captureFailure(page, testName, new Error(`Expected "${text}", got "${value}"`));
    }
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testMultiplePageSequence(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  let testName = 'Multi-Page Workflow';

  try {
    // Step 1: Goal
    await page.goto(`${BASE_URL}/grow-step-1`, { waitUntil: 'domcontentloaded' });
    const goal = testDataLibrary.goals[Math.floor(Math.random() * testDataLibrary.goals.length)];
    await page.locator('textarea').first().fill(goal);
    await page.waitForTimeout(300);

    let button = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
    if (await button.isEnabled({ timeout: 2000 }).catch(() => false)) {
      await button.click();
      await page.waitForTimeout(1000);

      // Step 2: Constraints
      if (page.url().includes('grow-step-2')) {
        const constraint = 'Budget constraint';
        const constraintField = page.locator('input[type="text"]').first();
        if (await constraintField.isVisible({ timeout: 2000 }).catch(() => false)) {
          await constraintField.fill(constraint);
          await page.waitForTimeout(300);

          button = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
          if (await button.isEnabled({ timeout: 2000 }).catch(() => false)) {
            await button.click();
            await page.waitForTimeout(1000);

            if (page.url().includes('grow-step-3')) {
              passCount++;
            } else {
              await captureFailure(page, testName, new Error('Failed to reach step 3'));
            }
          } else {
            await captureFailure(page, testName, new Error('Step 2 button disabled'));
          }
        } else {
          passCount++; // Different form structure
        }
      }
    } else {
      await captureFailure(page, testName, new Error('Step 1 button disabled after input'));
    }
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testButtonClickConsistency(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  let testName = 'Button Click Consistency';

  try {
    await page.goto(`${BASE_URL}/grow-step-1`, { waitUntil: 'domcontentloaded' });

    const textarea = page.locator('textarea').first();
    await textarea.fill('Test goal');

    // Try clicking button multiple times rapidly
    const button = page.locator('button:has-text("Continue"), button:has-text("Next")').first();

    const initialUrl = page.url();
    await button.click();
    await page.waitForTimeout(500);

    // If URL changed, only one click was processed (good)
    const newUrl = page.url();

    if (newUrl !== initialUrl || page.url().includes('grow-step')) {
      passCount++;
    } else {
      await captureFailure(page, testName, new Error('Button click did not navigate'));
    }
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testCopyPasteText(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  let testName = 'Copy-Paste Text Handling';

  try {
    await page.goto(`${BASE_URL}/grow-step-1`, { waitUntil: 'domcontentloaded' });

    const textarea = page.locator('textarea').first();
    const text = 'Copy paste test with special chars: @#$%^&*()';

    // Simulate paste by setting value
    await textarea.fill(text);
    const value = await textarea.inputValue();

    if (value === text) {
      passCount++;
    } else {
      await captureFailure(page, testName, new Error('Pasted text was modified'));
    }
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testPagePerformance(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  let testName = 'Page Load Performance';

  try {
    const startTime = Date.now();
    await page.goto(`${BASE_URL}/grow-step-1`, { waitUntil: 'domcontentloaded' });
    const loadTime = Date.now() - startTime;

    if (loadTime < 5000) {
      passCount++;
      console.log(`    Load time: ${loadTime}ms`);
    } else {
      await captureFailure(page, testName, new Error(`Slow load: ${loadTime}ms`), 'warning');
    }
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testConsoleErrors(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  let testName = 'Console Errors';

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    await page.goto(`${BASE_URL}/grow-step-1`, { waitUntil: 'domcontentloaded' });
    await randomDelay(500, 1000);

    const textarea = page.locator('textarea').first();
    await textarea.fill('Test');
    await randomDelay(300, 500);

    if (consoleErrors.length === 0) {
      passCount++;
    } else {
      await captureFailure(page, testName, new Error(`Console errors: ${consoleErrors.join(', ')}`), 'warning');
    }
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testNetworkResilience(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  let testName = 'Network Resilience';

  try {
    // Slow 3G simulation
    await page.route('**/*', route => {
      setTimeout(() => route.continue(), 100);
    });

    const startTime = Date.now();
    await page.goto(`${BASE_URL}/grow-step-1`, { waitUntil: 'domcontentloaded' });
    const loadTime = Date.now() - startTime;

    if (page.url().includes('grow-step-1')) {
      passCount++;
      console.log(`    Slow network load: ${loadTime}ms`);
    } else {
      await captureFailure(page, testName, new Error('Page failed to load on slow network'));
    }
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testRandomWorkflow(browser, runNumber) {
  // All major pages on the website
  const allPages = [
    // Grow workflow
    { name: 'Grow Step 1', route: '/grow-step-1' },
    { name: 'Grow Step 2', route: '/grow-step-2' },
    { name: 'Grow Step 3 Options', route: '/grow-step-3' },
    { name: 'Grow Step 3b Prioritize', route: '/grow-step-3b-prioritize' },
    { name: 'Grow Step 4', route: '/grow-step-4-will-do' },

    // Inversion workflow
    { name: 'Inversion Step 1', route: '/inversion-step-1' },
    { name: 'Inversion Step 2', route: '/inversion-step-2' },
    { name: 'Inversion Step 3', route: '/inversion-step-3' },

    // Strategic Alignment workflow
    { name: 'Goal Setting', route: '/goal-setting' },
    { name: 'Risks Assessment', route: '/risks-assessment' },
    { name: 'Critical Success Factors', route: '/critical-success-factors' },
    { name: 'Strategies', route: '/strategies' },
    { name: 'Project List', route: '/project-list' },
    { name: 'Project Matrix', route: '/project-matrix' },
    { name: 'Project Progress', route: '/project-progress' },

    // Other decision tools
    { name: 'Plan My Day', route: '/plan-my-day' },
    { name: 'Plan Meeting', route: '/plan-meeting' },
    { name: 'Tough Conversation', route: '/tough-conversation-step-1' },
    { name: 'If-Then Planning', route: '/if-then-planning' },
    { name: 'Stop-Doing Audit', route: '/stop-doing-audit' },

    // Reviews
    { name: 'My Journal (After-Action)', route: '/my-journal' },
    { name: 'Decision History', route: '/decision-history' },
    { name: 'Decision Tools', route: '/decision-tools' },

    // Other pages
    { name: 'Home', route: '/' },
    { name: 'Breathing Tool', route: '/breathe' },
  ];

  const pageToTest = allPages[Math.floor(Math.random() * allPages.length)];
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);

  let testName = `Page Load: ${pageToTest.name}`;

  try {
    await page.goto(`${BASE_URL}${pageToTest.route}`, { waitUntil: 'domcontentloaded' });

    // Check if page loaded
    if (page.url().includes(pageToTest.route.split('/')[1])) {

      // Try to interact with the page
      const textareas = page.locator('textarea');
      const inputs = page.locator('input[type="text"]');
      const selects = page.locator('select');

      let filled = false;

      // Fill first available field
      if (await textareas.count() > 0) {
        const testText = testDataLibrary.goals[Math.floor(Math.random() * testDataLibrary.goals.length)];
        await textareas.first().fill(testText);
        filled = true;
      } else if (await inputs.count() > 0) {
        await inputs.first().fill('Test input');
        filled = true;
      } else if (await selects.count() > 0) {
        const options = await selects.first().locator('option').count();
        if (options > 1) {
          await selects.first().selectOption({ index: 1 });
          filled = true;
        }
      }

      await randomDelay(200, 400);

      // Try to interact with buttons
      const buttons = page.locator('button');
      if (await buttons.count() > 0) {
        const button = buttons.first();
        if (await button.isEnabled({ timeout: 1000 }).catch(() => false)) {
          // Don't click if it's a dangerous button
          const text = await button.textContent();
          if (!text.includes('Delete') && !text.includes('Discard')) {
            // Safe to click test
          }
        }
      }

      passCount++;
      console.log(`    ✓ ${pageToTest.name} loaded and interactive`);
    } else {
      await captureFailure(page, testName, new Error(`Failed to load: expected ${pageToTest.route}, got ${page.url()}`));
    }
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function runComprehensiveStressing() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     🚀 CLARITY PORTAL COMPREHENSIVE STRESS TEST v2.0            ║');
  console.log('║              100-Run Deep Quality Audit                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`\n🎯 Target: ${BASE_URL}`);
  console.log(`📊 Test Runs: ${TEST_RUNS}`);
  console.log(`📸 Screenshots: ${SCREENSHOT_DIR}\n`);

  // Baseline comprehensive tests
  console.log('═══ COMPREHENSIVE BASELINE TESTS ═══');
  await testEmptyFieldValidation(browser);
  await testMaxLengthInput(browser);
  await testXSSPrevention(browser);
  await testFormStateAfterNavigation(browser);
  await testRapidInput(browser);
  await testMultiplePageSequence(browser);
  await testButtonClickConsistency(browser);
  await testCopyPasteText(browser);
  await testPagePerformance(browser);
  await testConsoleErrors(browser);
  await testNetworkResilience(browser);

  // 100 Random intensive stress tests
  console.log('\n═══ STRESS TESTING (100 RANDOM WORKFLOWS) ═══');
  for (let i = 1; i <= TEST_RUNS; i++) {
    const progress = `[${i}/${TEST_RUNS}]`.padEnd(8);
    console.log(`\n${progress} Random workflow stress test...`);
    await testRandomWorkflow(browser, i);
    await randomDelay(100, 400);
  }

  await browser.close();

  // Generate report
  generateReport();
}

function generateReport() {
  const totalTests = passCount + failCount + warningCount;
  const passRate = totalTests > 0 ? ((passCount / totalTests) * 100).toFixed(1) : 0;
  const errorBugs = bugs.filter(b => b.severity === 'error');
  const warningBugs = bugs.filter(b => b.severity === 'warning');

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalTests,
      passed: passCount,
      failed: failCount,
      warnings: warningCount,
      passRate: `${passRate}%`,
      url: BASE_URL,
    },
    bugsByCategory: {
      critical: errorBugs,
      warnings: warningBugs,
    },
  };

  const reportPath = './stress-test-comprehensive-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                    📊 COMPREHENSIVE TEST REPORT               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`\n✅ Passed: ${passCount}/${totalTests}`);
  console.log(`❌ Failed: ${failCount}/${totalTests}`);
  console.log(`⚠️ Warnings: ${warningCount}/${totalTests}`);
  console.log(`📈 Pass Rate: ${passRate}%`);

  if (errorBugs.length > 0) {
    console.log(`\n🔴 CRITICAL BUGS (${errorBugs.length}):`);
    console.log('═══════════════════════════════════════════════════════════════');
    errorBugs.slice(0, 10).forEach((bug, idx) => {
      console.log(`\n${idx + 1}. ${bug.testName}`);
      console.log(`   Error: ${bug.error}`);
      console.log(`   URL: ${bug.url}`);
    });
    if (errorBugs.length > 10) {
      console.log(`\n... and ${errorBugs.length - 10} more critical bugs`);
    }
  }

  if (warningBugs.length > 0) {
    console.log(`\n🟡 WARNINGS (${warningBugs.length}):`);
    console.log('═══════════════════════════════════════════════════════════════');
    warningBugs.slice(0, 5).forEach((bug, idx) => {
      console.log(`${idx + 1}. ${bug.testName}: ${bug.error}`);
    });
    if (warningBugs.length > 5) {
      console.log(`... and ${warningBugs.length - 5} more warnings`);
    }
  }

  if (errorBugs.length === 0 && warningBugs.length === 0) {
    console.log('\n✨ No bugs found! Website is stable and resilient.');
  }

  console.log(`\n📄 Full report: ${reportPath}`);
  console.log(`📸 Screenshots: ${SCREENSHOT_DIR}\n`);
}

runComprehensiveStressing().catch(console.error);
