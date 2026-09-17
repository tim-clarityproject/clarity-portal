# Decision Save Consistency Audit

## The Bug: Tough Conversation Shows as Draft When Completed

**Symptom:** Completed Tough Conversation decisions show "DRAFT" badge in My Decisions

**Root Cause:** Inconsistent field setting between decision workflows

## The Rule: Complete Save Pattern

Every decision MUST set **BOTH** fields when completing/finalizing:

```javascript
await supabase
  .from('decisions')
  .update({
    form_data: formDataComplete,
    draft: false,           // ✓ Required
    status: 'completed'     // ✓ Required (currently missing in Tough Convo)
  })
  .eq('id', decisionId);

// OR on insert:
await supabase
  .from('decisions')
  .insert({
    user_id: user.id,
    tool_type: 'tough-conversation',
    title,
    form_data: formDataComplete,
    draft: false,           // ✓ Required
    status: 'completed'     // ✓ Required (currently missing in Tough Convo)
  });
```

## Current Status by Workflow

### ✓ GROW (Correct)
- File: `GrowStep4WillDo.jsx`
- Update (line 111-112): `status: 'completed', draft: false` ✓
- Insert (line 125-126): `status: 'completed', draft: false` ✓

### ✓ Inversion (Correct)
- File: `InversionStep3Plan.jsx`
- Update (line 64): `status: 'completed', draft: false` ✓
- Insert (line 79): `status: 'completed', draft: false` ✓

### ✗ Tough Conversation (BROKEN)
- File: `ToughConversationStep2Coaching.jsx`
- Update (line 154): `draft: false` ✓ but **missing `status: 'completed'`** ✗
- Insert (line 167): `draft: false` ✓ but **missing `status: 'completed'`** ✗
- **Result:** Status stays NULL/default, UI sees `status === 'draft'`, badge shows

### ? Strategic Alignment (TBD)
- Multiple pages with saves
- Need to verify all follow the same pattern
- Files: GoalSetting, RisksAssessment, Strategies, CriticalSuccessFactors, ProjectList, ProjectMatrix

### ? Draft Saves (TBD)
- All workflows have `handleSaveAsDraft` methods
- These SHOULD set `draft: true` (currently correct)
- Verify consistency across all

## The Fix

Update each workflow's save/complete handlers:

**Pattern for Completion:**
```javascript
draft: false,
status: 'completed'
```

**Pattern for Draft Save:**
```javascript
draft: true,
status: 'draft'  // optional but recommended for clarity
```

## Files to Update

1. **ToughConversationStep2Coaching.jsx** (HIGH PRIORITY)
   - Line 110: Add `status: 'draft'` to draft save
   - Line 154: Add `status: 'completed'` to completion save
   - Line 122: Add `status: 'draft'` to draft insert
   - Line 166: Add `status: 'completed'` to completion insert

2. **Strategic Alignment Pages** (After ToughConvo fix)
   - GoalSetting.jsx (if has save logic)
   - RisksAssessment.jsx (if has save logic)
   - Strategies.jsx (if has save logic)
   - CriticalSuccessFactors.jsx (if has save logic)
   - ProjectList.jsx (if has save logic)
   - ProjectMatrix.jsx (if has save logic)

3. **After-Action Review & Progress Review** (MyJournal.jsx)
   - Check if it updates decision status after review save
   - Should probably set `status: 'completed'` if reviewing a completed decision

## Verification Checklist

- [ ] All GROW saves have `draft` + `status`
- [ ] All Inversion saves have `draft` + `status`
- [ ] All Tough Conversation saves have `draft` + `status`
- [ ] All Strategic Alignment saves have `draft` + `status`
- [ ] All draft saves explicitly set `status: 'draft'`
- [ ] All completion saves explicitly set `status: 'completed'`
- [ ] UI correctly filters on BOTH `draft` AND `status`
- [ ] Test: Complete decision, check My Decisions, verify NO badge appears

## UI Consistency

DecisionHistory.jsx line 168:
```javascript
{(decision.draft || decision.status === 'draft') && (
  <span>Draft</span>
)}
```

This is correct — it shows badge if EITHER condition true. But the saves must set status correctly.

## Long-Term Solution

To prevent future bugs like this:
1. Create a `saveDectionAsCompleted()` helper function that enforces BOTH fields
2. Create a `saveDectionAsDraft()` helper function for draft saves
3. Use these helpers everywhere instead of inline Supabase calls
4. Add tests to verify both fields are always set

Example:
```javascript
const saveDecisionAsCompleted = async (supabase, decisionId, userId, formData, toolType, title) => {
  return supabase
    .from('decisions')
    .update({
      form_data: formData,
      draft: false,
      status: 'completed'
    })
    .eq('id', decisionId)
    .eq('user_id', userId);
};
```

This would prevent this class of bugs entirely.
