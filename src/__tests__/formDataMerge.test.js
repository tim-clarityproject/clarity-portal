/**
 * Test suite for form data merge logic
 * Tests the behavior of combining new fields with existing saved data
 */

// Simulate the merge logic from SaveDiscardButtons
function mergeFormData(existingFormData = {}, newFormData = {}) {
  const merged = { ...existingFormData };

  Object.entries(newFormData).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      merged[key] = value;
    }
  });

  return merged;
}

// Test 1: Save step 1, then step 2, goal survives
function testGoalSurvivesAcrossSteps() {
  console.log('\n✓ Test 1: Goal survives from Step 1 through Step 2');

  // Step 1 saves only goal
  let savedData = mergeFormData({}, { goal: 'Improve time management' });
  console.log('  After Step 1:', JSON.stringify(savedData));

  if (savedData.goal !== 'Improve time management') {
    throw new Error('Step 1: Goal not saved');
  }

  // Step 2 saves only constraints and opportunities
  savedData = mergeFormData(savedData, {
    constraints: 'Limited time',
    opportunities: 'Automation tools available'
  });
  console.log('  After Step 2:', JSON.stringify(savedData));

  if (savedData.goal !== 'Improve time management') {
    throw new Error('Step 2: Goal was overwritten');
  }
  if (savedData.constraints !== 'Limited time') {
    throw new Error('Step 2: Constraints not saved');
  }
  if (savedData.opportunities !== 'Automation tools available') {
    throw new Error('Step 2: Opportunities not saved');
  }

  console.log('  PASS: All fields present after both steps');
}

// Test 2: Undefined values do not erase saved data
function testUndefinedValuesDoNotErase() {
  console.log('\n✓ Test 2: Undefined values do not erase saved data');

  // Initial data with all fields
  const existing = {
    goal: 'Improve time management',
    constraints: 'Limited time',
    opportunities: 'Automation tools',
    options: ['Option A', 'Option B'],
    will_do: 'Start tomorrow'
  };

  // Try to save with undefined values (simulating a step that doesn't set a field)
  const updated = mergeFormData(existing, {
    constraints: undefined,
    opportunities: null,
    goal: 'Updated goal'
  });

  console.log('  Before merge:', JSON.stringify(existing));
  console.log('  New data (undefined/null):', JSON.stringify({ constraints: undefined, opportunities: null, goal: 'Updated goal' }));
  console.log('  After merge:', JSON.stringify(updated));

  if (updated.goal !== 'Updated goal') {
    throw new Error('Goal should be updated');
  }
  if (updated.constraints !== 'Limited time') {
    throw new Error('Constraints was erased by undefined value');
  }
  if (updated.opportunities !== 'Automation tools') {
    throw new Error('Opportunities was erased by null value');
  }
  if (updated.options.length !== 2) {
    throw new Error('Options was erased');
  }
  if (updated.will_do !== 'Start tomorrow') {
    throw new Error('Will do was erased');
  }

  console.log('  PASS: Existing data preserved when new values are undefined/null');
}

// Test 3: Completed guard blocks incomplete records
function testCompletedGuardBlocksIncomplete() {
  console.log('\n✓ Test 3: Completed guard blocks incomplete records');

  function validateBeforeMarkCompleted(data) {
    const missingFields = [];
    if (!data.goal?.trim?.()) missingFields.push('Goal');
    if (!data.constraints?.trim?.()) missingFields.push('Constraints');
    if (!data.opportunities?.trim?.()) missingFields.push('Opportunities');
    if (!Array.isArray(data.options) || data.options.length === 0 || data.options.every(opt => !opt?.trim?.())) {
      missingFields.push('Options');
    }
    if (!data.will_do?.trim?.()) missingFields.push('Will Do');

    return {
      isComplete: missingFields.length === 0,
      missingFields
    };
  }

  // Test 3a: Only goal filled
  const incomplete1 = {
    goal: 'Some goal',
    constraints: '',
    opportunities: '',
    options: [],
    will_do: ''
  };
  const result1 = validateBeforeMarkCompleted(incomplete1);
  console.log('  Only goal filled:', result1);
  if (result1.isComplete) {
    throw new Error('Should not allow marking complete with only goal');
  }
  if (!result1.missingFields.includes('Constraints')) {
    throw new Error('Should detect missing Constraints');
  }

  // Test 3b: All fields filled
  const complete = {
    goal: 'Improve time management',
    constraints: 'Limited time',
    opportunities: 'Automation available',
    options: ['Option A', 'Option B'],
    will_do: 'Start tomorrow'
  };
  const result2 = validateBeforeMarkCompleted(complete);
  console.log('  All fields filled:', result2);
  if (!result2.isComplete) {
    throw new Error('Should allow marking complete when all fields filled');
  }
  if (result2.missingFields.length > 0) {
    throw new Error('Should not report missing fields when all are filled');
  }

  // Test 3c: Options with empty strings (invalid)
  const incomplete2 = {
    goal: 'Goal',
    constraints: 'Constraint',
    opportunities: 'Opportunity',
    options: ['', '', ''],
    will_do: 'Will do'
  };
  const result3 = validateBeforeMarkCompleted(incomplete2);
  console.log('  Options with empty strings:', result3);
  if (result3.isComplete) {
    throw new Error('Should not allow marking complete with empty options');
  }

  console.log('  PASS: Validation correctly identifies incomplete records');
}

// Run all tests
try {
  console.log('========================================');
  console.log('Running Form Data Merge Tests');
  console.log('========================================');

  testGoalSurvivesAcrossSteps();
  testUndefinedValuesDoNotErase();
  testCompletedGuardBlocksIncomplete();

  console.log('\n========================================');
  console.log('All tests passed ✓');
  console.log('========================================\n');
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  process.exit(1);
}
