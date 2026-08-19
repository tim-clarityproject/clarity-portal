import { chromium } from 'playwright';

const caseStudies = [
  {
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
  },
  {
    name: 'PM - EMEA Market Entry',
    route: 'Me',
    goal: 'Successfully launch our SaaS product in EMEA market within 6 months with 50+ paying customers',
    risks: [
      'Regulatory compliance and data residency requirements unknown',
      'Limited budget for localization and marketing',
      'Competing with established regional players with brand recognition'
    ],
    strategies: [
      'Hire local regulatory consultant immediately to map requirements',
      'Partner with regional agencies for marketing to reduce upfront costs',
      'Focus on unique value prop that addresses specific European workflow needs'
    ],
    ratings: [5, 4, 4]
  },
  {
    name: 'HR Director - Remote Work Culture',
    route: 'My Team',
    goal: 'Transition company culture to asynchronous-first remote work while maintaining team cohesion and performance',
    risks: [
      'Timezone challenges lead to coordination bottlenecks',
      'Company culture and relationships suffer without in-person interaction',
      'Managers lack training to lead distributed teams effectively'
    ],
    strategies: [
      'Establish core overlap hours (11am-3pm UTC) for synchronous collaboration',
      'Create quarterly in-person summits for relationship building and strategy alignment',
      'Implement manager training program on async leadership and remote team dynamics'
    ],
    ratings: [3, 5, 4]
  },
  {
    name: 'Startup Founder - Product-Market Fit',
    route: 'Me',
    goal: 'Achieve product-market fit and secure Series A funding within 12 months',
    risks: [
      'Customer acquisition cost exceeds lifetime value',
      'Product doesn\'t solve the real pain point customers care about',
      'Team lacks experience with scaling operations',
      'Runway depletes before hitting key metrics'
    ],
    strategies: [
      'Deep customer interviews weekly to validate problem-solution fit before scaling ads',
      'Hire experienced Head of Operations with previous Series A experience',
      'Focus sales on 3-5 key accounts to prove unit economics before scaling',
      'Implement strict cash management and 18-month runway discipline'
    ],
    ratings: [5, 4, 5, 3]
  }
];

async function runCaseStudy(browser, caseStudy, index) {
  console.log(`\n🚀 [${index + 1}/4] Running: ${caseStudy.name}`);
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);

  try {
    // Welcome page
    console.log('   → Welcome page');
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Begin' }).click();
    await page.waitForURL('**/choose-focus');

    // Choose focus
    console.log(`   → Choosing: ${caseStudy.route}`);
    await page.getByRole('button', { name: caseStudy.route }).click();
    await page.waitForURL('**/goal-setting');

    // Goal setting
    console.log('   → Filling goal');
    await page.locator('textarea').fill(caseStudy.goal);
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Continue' }).first().click();
    await page.waitForURL('**/risks-assessment');

    // Risks assessment
    console.log(`   → Adding ${caseStudy.risks.length} risks`);
    for (let i = 0; i < caseStudy.risks.length; i++) {
      const inputs = page.locator('input[type="text"]');
      const count = await inputs.count();

      if (count <= i) {
        // Need to add another risk
        if (i > 0) {
          await page.getByRole('button', { name: 'Add another way' }).click();
          await page.waitForTimeout(200);
        }
      }

      await inputs.nth(i).fill(caseStudy.risks[i]);
      await page.waitForTimeout(150);
    }

    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Continue' }).first().click();
    await page.waitForURL('**/strategies');

    // Strategies
    console.log(`   → Adding ${caseStudy.strategies.length} strategies`);
    const textareas = page.locator('textarea');
    for (let i = 0; i < caseStudy.strategies.length; i++) {
      await textareas.nth(i).fill(caseStudy.strategies[i]);
      await page.waitForTimeout(150);
    }

    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Continue' }).first().click();
    await page.waitForURL('**/dashboard');

    // Dashboard - rating sliders
    console.log('   → Rating strategies');
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

    // Results page - wait for chart and take screenshot
    console.log('   → Generating results');
    await page.waitForTimeout(2000);
    const filename = `case-study-${index + 1}-${caseStudy.name.toLowerCase().replace(/\s+/g, '-')}.png`;
    await page.screenshot({ path: filename, fullPage: true });

    console.log(`✅ Completed`);
    console.log(`   📊 Screenshot: ${filename}`);
    console.log(`   💯 Ratings: [${caseStudy.ratings.join(', ')}]`);

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 Clarity Portal - Case Study Testing');
  console.log('═══════════════════════════════════════════════════════');

  for (let i = 0; i < caseStudies.length; i++) {
    await runCaseStudy(browser, caseStudies[i], i);
    if (i < caseStudies.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  await browser.close();
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('✨ All case studies completed!');
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(console.error);
