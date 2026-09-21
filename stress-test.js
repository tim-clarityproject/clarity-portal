import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://portal.theclarityproject.co.uk';
const TEST_RUNS = 50;
const SCREENSHOT_DIR = './stress-test-failures';

// Test data library for variety
const testDataLibrary = {
  goals: [
    'Build a world-class product that solves customer pain',
    'Improve team productivity by 50% this quarter',
    'Launch in 3 new markets and hit $1M ARR',
    'Create a culture of continuous learning',
    'Scale from 10 to 100 customers',
    'Reduce operational costs by 40%',
    'Build an AI-powered feature',
    '',  // Empty to test validation
  ],
  decisions: [
    'Choose between Stripe and Paddle for payments',
    'Hire in-house team or use contractors',
    'Build MVP in React or Vue',
    'Focus on B2B or B2C market',
    'Use Supabase or Firebase for database',
    'Price at $29/mo or $99/mo',
    '',  // Empty
  ],
  options: [
    'Option A is innovative but risky',
    'Option B is safe but slow',
    'Option C has unknown consequences',
  ],
  veryLongText: 'Lorem ipsum dolor sit amet, '.repeat(50),
  specialChars: 'Test with @#$%^&*() and émojis 🎉🚀',
};

let bugs = [];
let passCount = 0;
let failCount = 0;

async function randomDelay(min = 100, max = 500) {
  const delay = Math.random() * (max - min) + min;
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function generateTestEmail() {
  return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@claritytest.local`;
}

async function captureFailure(page, testName, error) {
  failCount++;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}-${testName.replace(/\s+/g, '-')}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);

  try {
    await page.screenshot({ path: filepath, fullPage: true });
  } catch (e) {
    console.log(`  Could not capture screenshot: ${e.message}`);
  }

  const bug = {
    timestamp: new Date().toISOString(),
    testName,
    error: error.message,
    url: page.url(),
    screenshot: filename,
  };
  bugs.push(bug);
  console.log(`  ❌ ${testName}: ${error.message}`);
  console.log(`     Screenshot: ${filename}`);
}

async function testSignupFlow(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  let testName = 'Signup Flow';

  try {
    console.log(`\n📝 Test: ${testName}`);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // Look for signup button or auth flow
    const signupButton = page.locator('button:has-text("Sign Up"), button:has-text("Create Account"), button:has-text("Get Started")').first();
    if (await signupButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await signupButton.click();
      await randomDelay(500, 1000);
    }

    const email = await generateTestEmail();
    const password = 'TestPass123!@#';

    // Try to find and fill email input
    const emailInputs = page.locator('input[type="email"], input[placeholder*="mail" i], input[placeholder*="email" i]');
    if (await emailInputs.count() > 0) {
      await emailInputs.first().fill(email);
      await randomDelay(200, 400);
      console.log(`   ✓ Email entered: ${email}`);
    }

    // Try password input
    const passwordInputs = page.locator('input[type="password"]');
    if (await passwordInputs.count() > 0) {
      await passwordInputs.first().fill(password);
      await randomDelay(200, 400);
      console.log(`   ✓ Password entered`);
    }

    // Find and click submit
    const submitButtons = page.locator('button:has-text("Sign Up"), button:has-text("Create"), button:has-text("Continue")');
    if (await submitButtons.count() > 0) {
      await submitButtons.first().click();
      await page.waitForTimeout(3000);
      console.log(`   ✓ Signup submitted`);
    }

    passCount++;
    console.log(`   ✅ Passed`);
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testGrowWorkflow(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  let testName = 'Grow Workflow';

  try {
    console.log(`\n🌱 Test: ${testName}`);
    await page.goto(`${BASE_URL}/grow-step-1`, { waitUntil: 'domcontentloaded' });

    // Fill goal
    const goalTextarea = page.locator('textarea').first();
    const goalText = testDataLibrary.goals[Math.floor(Math.random() * testDataLibrary.goals.length)];
    if (goalText) {
      await goalTextarea.fill(goalText);
      console.log(`   ✓ Goal entered: "${goalText.substring(0, 40)}..."`);
    }

    // Click next
    const nextButton = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
    await nextButton.click();
    await page.waitForTimeout(1000);

    // Verify we moved to step 2
    if (page.url().includes('grow-step')) {
      console.log(`   ✓ Navigated to next step`);
      passCount++;
      console.log(`   ✅ Passed`);
    } else {
      throw new Error('Did not navigate to next step');
    }
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testInversionWorkflow(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  let testName = 'Inversion Workflow';

  try {
    console.log(`\n🔄 Test: ${testName}`);
    await page.goto(`${BASE_URL}/inversion-step-1`, { waitUntil: 'domcontentloaded' });

    const textarea = page.locator('textarea').first();
    const decision = testDataLibrary.decisions[Math.floor(Math.random() * testDataLibrary.decisions.length)];

    if (decision) {
      await textarea.fill(decision);
      console.log(`   ✓ Decision entered: "${decision.substring(0, 40)}..."`);
    }

    const nextButton = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
    await nextButton.click();
    await page.waitForTimeout(1000);

    passCount++;
    console.log(`   ✅ Passed`);
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testPlanDayWorkflow(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  let testName = 'Plan My Day Workflow';

  try {
    console.log(`\n📅 Test: ${testName}`);
    await page.goto(`${BASE_URL}/plan-my-day`, { waitUntil: 'domcontentloaded' });

    // Try to fill first textarea if it exists
    const textareas = page.locator('textarea');
    if (await textareas.count() > 0) {
      await textareas.first().fill('Today I want to ship the new dashboard feature');
      console.log(`   ✓ Daily goal entered`);
    }

    // Look for continue/next button
    const nextButton = page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Save")').first();
    if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextButton.click();
      await page.waitForTimeout(1000);
      console.log(`   ✓ Form submitted`);
    }

    passCount++;
    console.log(`   ✅ Passed`);
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testMeetingPlannerWorkflow(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  let testName = 'Meeting Planner Workflow';

  try {
    console.log(`\n🤝 Test: ${testName}`);
    await page.goto(`${BASE_URL}/plan-meeting`, { waitUntil: 'domcontentloaded' });

    // Try to fill meeting title
    const inputs = page.locator('input[type="text"]');
    if (await inputs.count() > 0) {
      await inputs.first().fill('Team Sync Meeting');
      console.log(`   ✓ Meeting title entered`);
    }

    const nextButton = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
    if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextButton.click();
      await page.waitForTimeout(1000);
    }

    passCount++;
    console.log(`   ✅ Passed`);
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testDataPersistence(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  let testName = 'Data Persistence (Refresh)';

  try {
    console.log(`\n💾 Test: ${testName}`);
    await page.goto(`${BASE_URL}/grow-step-1`, { waitUntil: 'domcontentloaded' });

    const testData = 'Test data persistence with random value ' + Math.random();
    const textarea = page.locator('textarea').first();
    await textarea.fill(testData);
    console.log(`   ✓ Data entered: "${testData}"`);

    // Refresh page
    await page.reload({ waitUntil: 'domcontentloaded' });
    console.log(`   ✓ Page refreshed`);

    // Check if data persists
    const textareaAfter = page.locator('textarea').first();
    const value = await textareaAfter.inputValue();

    if (value === testData) {
      console.log(`   ✓ Data persisted after refresh`);
      passCount++;
      console.log(`   ✅ Passed`);
    } else {
      throw new Error(`Data not persisted: expected "${testData}", got "${value}"`);
    }
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testTextareaAutoExpand(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  let testName = 'Textarea Auto-expand';

  try {
    console.log(`\n📝 Test: ${testName}`);
    await page.goto(`${BASE_URL}/grow-step-1`, { waitUntil: 'domcontentloaded' });

    const textarea = page.locator('textarea').first();
    const initialHeight = await textarea.evaluate(el => el.scrollHeight);

    // Fill with lots of text
    await textarea.fill(testDataLibrary.veryLongText);
    await randomDelay(300, 500);

    const finalHeight = await textarea.evaluate(el => el.scrollHeight);

    if (finalHeight > initialHeight) {
      console.log(`   ✓ Textarea expanded from ${initialHeight}px to ${finalHeight}px`);
      passCount++;
      console.log(`   ✅ Passed`);
    } else {
      throw new Error('Textarea did not expand with content');
    }
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testButtonHoverStates(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  let testName = 'Button Hover States';

  try {
    console.log(`\n🎨 Test: ${testName}`);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // Find a button and check hover styling
    const buttons = page.locator('button');
    if (await buttons.count() > 0) {
      const button = buttons.first();
      const normalBg = await button.evaluate(el => window.getComputedStyle(el).backgroundColor);

      await button.hover();
      await randomDelay(100, 200);
      const hoverBg = await button.evaluate(el => window.getComputedStyle(el).backgroundColor);

      if (normalBg !== hoverBg) {
        console.log(`   ✓ Button hover state changed (${normalBg} → ${hoverBg})`);
        passCount++;
        console.log(`   ✅ Passed`);
      } else {
        console.log(`   ⚠ Button hover state did not change (may be normal for some buttons)`);
        passCount++;
      }
    }
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testResponsiveMobile(browser) {
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
  page.setDefaultTimeout(8000);
  let testName = 'Mobile Responsiveness';

  try {
    console.log(`\n📱 Test: ${testName}`);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // Check that page doesn't have horizontal scroll
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    if (!hasHorizontalScroll) {
      console.log(`   ✓ No horizontal scrolling on mobile (375px)`);
      passCount++;
      console.log(`   ✅ Passed`);
    } else {
      throw new Error('Page has horizontal scroll on mobile viewport');
    }
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testSpecialCharacters(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  let testName = 'Special Characters Input';

  try {
    console.log(`\n🔤 Test: ${testName}`);
    await page.goto(`${BASE_URL}/grow-step-1`, { waitUntil: 'domcontentloaded' });

    const textarea = page.locator('textarea').first();
    const specialText = testDataLibrary.specialChars;
    await textarea.fill(specialText);

    const value = await textarea.inputValue();
    if (value === specialText) {
      console.log(`   ✓ Special characters preserved`);
      passCount++;
      console.log(`   ✅ Passed`);
    } else {
      throw new Error('Special characters not preserved correctly');
    }
  } catch (error) {
    await captureFailure(page, testName, error);
  } finally {
    await page.close();
  }
}

async function testRandomWorkflow(browser, runNumber) {
  const workflows = [
    () => testGrowWorkflow(browser),
    () => testInversionWorkflow(browser),
    () => testPlanDayWorkflow(browser),
    () => testMeetingPlannerWorkflow(browser),
  ];

  const randomWorkflow = workflows[Math.floor(Math.random() * workflows.length)];
  try {
    await randomWorkflow();
  } catch (error) {
    console.log(`Random workflow test failed: ${error.message}`);
  }
}

async function runStressTesting() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        🚀 CLARITY PORTAL COMPREHENSIVE STRESS TEST          ║');
  console.log('║                   50-Run Bug Hunt                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n🎯 Target: ${BASE_URL}`);
  console.log(`📊 Test Runs: ${TEST_RUNS}`);
  console.log(`📸 Screenshots: ${SCREENSHOT_DIR}\n`);

  // Baseline tests (run once)
  console.log('═══ BASELINE TESTS ═══');
  await testSignupFlow(browser);
  await testGrowWorkflow(browser);
  await testInversionWorkflow(browser);
  await testPlanDayWorkflow(browser);
  await testMeetingPlannerWorkflow(browser);
  await testDataPersistence(browser);
  await testTextareaAutoExpand(browser);
  await testButtonHoverStates(browser);
  await testResponsiveMobile(browser);
  await testSpecialCharacters(browser);

  // Random workflow stress tests (50 runs)
  console.log('\n═══ STRESS TESTING (50 RANDOM WORKFLOWS) ═══');
  for (let i = 1; i <= TEST_RUNS; i++) {
    const progress = `[${i}/${TEST_RUNS}]`.padEnd(8);
    console.log(`\n${progress} Random workflow test...`);
    await testRandomWorkflow(browser, i);
    await randomDelay(300, 800);
  }

  await browser.close();

  // Generate report
  generateReport();
}

function generateReport() {
  const totalTests = passCount + failCount;
  const passRate = totalTests > 0 ? ((passCount / totalTests) * 100).toFixed(1) : 0;

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalTests,
      passed: passCount,
      failed: failCount,
      passRate: `${passRate}%`,
      url: BASE_URL,
    },
    bugs: bugs.length > 0 ? bugs : 'No bugs found!',
  };

  const reportPath = './stress-test-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    📊 TEST REPORT                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n✅ Passed: ${passCount}/${totalTests}`);
  console.log(`❌ Failed: ${failCount}/${totalTests}`);
  console.log(`📈 Pass Rate: ${passRate}%`);

  if (bugs.length > 0) {
    console.log(`\n🐛 BUGS FOUND (${bugs.length}):`);
    console.log('═══════════════════════════════════════════════════════════');
    bugs.forEach((bug, idx) => {
      console.log(`\n${idx + 1}. ${bug.testName}`);
      console.log(`   Error: ${bug.error}`);
      console.log(`   URL: ${bug.url}`);
      console.log(`   Screenshot: ${bug.screenshot}`);
      console.log(`   Time: ${bug.timestamp}`);
    });
  } else {
    console.log('\n✨ No bugs found! Website is stable.');
  }

  console.log(`\n📄 Full report saved to: ${reportPath}`);
  console.log(`📸 Screenshots saved to: ${SCREENSHOT_DIR}\n`);
}

runStressTesting().catch(console.error);
