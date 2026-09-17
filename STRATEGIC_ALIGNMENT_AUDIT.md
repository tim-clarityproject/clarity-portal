# Strategic Alignment Tool - Comprehensive Audit

## Audit Date: Sep 17, 2026

### Workflow Map

```
Welcome (Select "Where my team should focus")
    ↓ (passes: problemTitle, path='team', isGuest)
GoalSetting
    ↓ (should pass: ...location.state, goal)
RisksAssessment
    ↓ (should pass: ...location.state, risks)
CriticalSuccessFactors (if path='team') OR Strategies (if path!='team')
    ↓ (should pass: ...location.state, factors/strategies)
ProjectList
    ↓ (should pass: ...location.state, projects)
ProjectMatrix
    ↓ (should pass: ...location.state, matrix)
ProjectProgress
    ↓ (should pass: ...location.state, progress)
ProjectScatter [FINAL SAVE]
    ↓ (saves form_data to database)
My Decisions
```

---

## Findings from Audit

### ✅ FIXED This Session

1. **toolType Consistency** (CRITICAL)
   - ✅ Fixed: All pages now use `toolType="strategic-alignment"`
   - Was: Mixed 'team-focus', 'goal-setting', 'grow'
   - Impact: Decisions now save with correct tool identification

2. **ProjectScatter Save Operation** (CRITICAL)
   - ✅ Fixed: Uses proper `form_data` structure
   - ✅ Fixed: Sets `draft: false, status: 'completed'`
   - ✅ Fixed: Handles both insert (new) and update (resume draft)
   - ✅ Fixed: Collects all workflow data: goal, risks, strategies, factors, projects, matrix, progress

3. **Data Accumulation Chain** (HIGH)
   - ✅ Fixed: GoalSetting passes `goal` to next page
   - ✅ Fixed: Strategies navigates to `/project-list` (not /dashboard)
   - ✅ Fixed: All pages use consistent navigation: `{ state: { ...location.state, [newData], isGuest } }`

4. **Draft Save Naming** (MEDIUM)
   - ✅ Fixed: SaveDiscardButtons uses `location.state?.problemTitle || dateTitle`
   - Result: Drafts show "Where my team should focus" not just date

### ⚠️ POTENTIAL ISSUES (Need Verification)

1. **Strategies Path (Personal Alignment)**
   - Status: Unused in current workflow (path='team' skips it)
   - Risk: If someone uses personal path, Strategies might have missing data
   - Action: Verify Strategies is not used for "Where my team should focus"

2. **Form Data Completeness**
   - Fields being accumulated: goal, risks, strategies, factors, projects, matrix, progress
   - Missing?: strategies will be empty for team path (goes through CriticalSuccessFactors instead)
   - Action: ProjectScatter should handle missing fields gracefully

3. **Resume Draft Logic**
   - ProjectScatter checks `location.state?.decisionId` to resume
   - Risk: When resuming from My Decisions, is decisionId passed through?
   - Action: Verify decision resume flow passes decisionId

4. **Navigation State Loss**
   - If user refreshes page mid-workflow, location.state resets
   - FormContext was cleared on fresh start (per refactor)
   - Risk: User loses all entered data on page refresh
   - Action: This is acceptable UX (user can start over)

---

## Manual Testing Checklist

### Fresh Decision Flow (Team Path)
- [ ] Start new decision from Welcome
- [ ] GoalSetting: Enter goal, save as draft → Check name in My Decisions
- [ ] GoalSetting: Click "Continue" to navigate
- [ ] RisksAssessment: Add risks, navigate forward
- [ ] CriticalSuccessFactors: Add factors, navigate forward
- [ ] ProjectList: Add projects, navigate forward
- [ ] ProjectMatrix: Fill matrix, navigate forward
- [ ] ProjectProgress: Set progress, navigate forward
- [ ] ProjectScatter: Click "Save to Log"
- [ ] Verify: Decision appears in My Decisions with correct name
- [ ] Verify: Tool type shows as "Strategic Alignment" (or generic DECISION badge)
- [ ] Click decision: Decision Summary loads with all data

### Draft Resume Flow
- [ ] Start new decision
- [ ] Save as draft on page 1
- [ ] Go to My Decisions
- [ ] Click draft decision
- [ ] Verify: Loads with data from where it was saved
- [ ] Continue to next step
- [ ] Verify: Previous data is preserved

### Data Accumulation
- [ ] After completing workflow, check Decision Summary contains:
  - [ ] Goal
  - [ ] Risks
  - [ ] Factors
  - [ ] Projects
  - [ ] Matrix data
  - [ ] Progress data

### Edge Cases
- [ ] Save draft on each page
- [ ] Refresh page mid-workflow → should clear and require starting over
- [ ] Navigate back and forth between pages → data should persist
- [ ] Complete decision → verify goes to My Decisions
- [ ] Delete decision → verify removed from My Decisions

---

## Data Structure in Database

### What SHOULD be saved (from ProjectScatter fix):
```javascript
{
  user_id: uuid,
  tool_type: 'strategic-alignment',
  title: 'Where my team should focus' or date,
  form_data: {
    goal: string,
    risks: array,
    strategies: array,
    factors: array,
    projects: array,
    matrix: object,
    progress: object
  },
  draft: boolean,
  status: 'completed' | 'draft',
  created_at: timestamp,
  updated_at: timestamp
}
```

### What should NOT be saved anymore:
- ~~details~~ object (was used before fix)
- ~~goal~~ as top-level field (should be inside form_data)
- Missing title, draft, status fields

---

## Summary

### Critical Issues Fixed
- ✅ toolType was inconsistent (7 pages)
- ✅ Save operation used wrong data structure  
- ✅ Data wasn't being accumulated through workflow
- ✅ Drafts showed date instead of decision name

### Remaining Risks
- ⚠️ Need to verify resume from draft flow works end-to-end
- ⚠️ DecisionSummary might not handle all form_data fields
- ⚠️ Strategies branch (personal alignment) unused but not deleted

### Test Before User Testing
Run full manual testing checklist above before sending to beta users.

---

## Next Steps

1. **User Test**: Run fresh decision flow end-to-end
2. **Verify Draft Resume**: Save on page 1, resume from My Decisions
3. **Check Summary**: View completed decision in Decision Summary
4. **Verify Data**: Confirm all form_data fields are displayed
5. **Check Multiple Drafts**: Can user save drafts on different pages
6. **Ready for Beta**: Once all testing passes

**Status: Fixes deployed, awaiting user verification**
