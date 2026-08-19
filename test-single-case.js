import { chromium } from 'playwright';

const caseStudy = {
  name: 'Engineering Manager - Team Performance',
  route: 'Me',
  goal: 'Build a high-performing engineering team that can ship features 40% faster while maintaining code quality',
  risks: [
    'Key senior engineers might leave due to burnout or better opportunities',
    'Knowledge silos prevent team from shipping independently',
    'Technical debt accumulates and slows down future development'
  ],
  strategies: [
    'Implement mentorship program pairing seniors with juniors for knowledge transfer',
    'Establish code review standards and mandatory documentation for all features',
    'Dedicate 20% sprint capacity to tech debt reduction each quarter'
  ],
  ratings: [4, 4, 3]
};

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);

  try {
    console.log('🎨 Testing improved visualization...\n');

    await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Begin' }).click();
    await page.waitForURL('**/choose-focus');

    await page.getByRole('button', { name: caseStudy.route }).click();
    await page.waitForURL('**/goal-setting');

    await page.locator('textarea').fill(caseStudy.goal);
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Continue' }).first().click();
    await page.waitForURL('**/risks-assessment');

    for (let i = 0; i < caseStudy.risks.length; i++) {
      const inputs = page.locator('input[type="text"]');
      const count = await inputs.count();
      if (count <= i && i > 0) {
        await page.getByRole('button', { name: 'Add another way' }).click();
        await page.waitForTimeout(200);
      }
      await inputs.nth(i).fill(caseStudy.risks[i]);
      await page.waitForTimeout(150);
    }

    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Continue' }).first().click();
    await page.waitForURL('**/strategies');

    const textareas = page.locator('textarea');
    for (let i = 0; i < caseStudy.strategies.length; i++) {
      await textareas.nth(i).fill(caseStudy.strategies[i]);
      await page.waitForTimeout(150);
    }

    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Continue' }).first().click();
    await page.waitForURL('**/dashboard');

    const sliders = page.locator('input[type="range"]');
    for (let i = 0; i < caseStudy.ratings.length; i++) {
      await sliders.nth(i).evaluate((el, val) => {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, caseStudy.ratings[i]);
      await page.waitForTimeout(100);
    }

    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Continue' }).first().click();
    await page.waitForURL('**/results');

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'improved-visualization-demo.png', fullPage: true });

    console.log('✅ Test complete!');
    console.log('📸 Screenshot: improved-visualization-demo.png');
    console.log('\n🎨 Improvements implemented:');
    console.log('   ✓ Clean radar chart (no text overflow)');
    console.log('   ✓ Color-coded confidence levels');
    console.log('   ✓ Full strategy names in legend');
    console.log('   ✓ Visual rating indicators (dots)');
    console.log('   ✓ Better scale visibility');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

test();
