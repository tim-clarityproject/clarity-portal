# Design System Consistency Audit - Findings & Status

**Audit Date:** 2026-09-24  
**Status:** In Progress (Phase 2)  
**Purpose:** Verify all pages comply with design system tokens defined in designTokens.js

---

## Summary

The design system was established in PHASE 3 Step 1 with comprehensive tokens for typography, colors, spacing, borders, shadows, and button/card presets. This audit identifies inconsistencies across all pages and tracks fixes.

**Progress:**
- ✅ 3 pages fully token-compliant (Welcome, PersonalOperatingPlan, About)
- 🔄 1 page audited & fixed (MyAccount) 
- ⏳ 25+ pages pending audit/fixes

---

## Audit Findings by Page

### TIER 1 - High Traffic Pages

#### ✅ Welcome.jsx - COMPLIANT
- **Status:** Design tokens applied
- **Changes:** Greeting size, dropdown styling, spacing
- **Details:** All major elements use designTokens

#### ✅ PersonalOperatingPlan.jsx - COMPLIANT
- **Status:** Design tokens applied
- **Changes:** Mission panel, strategy cards, buttons, archive button
- **Details:** Full token integration completed

#### ✅ About.jsx - COMPLIANT
- **Status:** Design tokens applied
- **Changes:** Sections, feature cards, back button, typography
- **Details:** Full token integration completed

#### 🔄 MyAccount.jsx - PARTIALLY COMPLIANT (Fixed in this phase)
- **Status:** Audited & Fixed
- **Issues Found:**
  - H1 using `fontSize: 32px, fontWeight: 'bold'` → Should use h1 token (36px, 700)
  - H2 sections using hardcoded `fontSize: 14px` → Now use h2 token (18px)
  - Font weights: Using 'bold' instead of 700 → Fixed to use token weights
  - Colors: Hardcoded #333, #999, #F08571 → Now use designTokens.colors
  - Buttons: Custom secondary styling → Now use button.secondary preset
  - Archived mission cards: Hardcoded padding/border/shadow → Now use card preset
  - Button hover states: Hardcoded colors → Now use designTokens colors
- **Fixes Applied:**
  - H1/H2: Now use designTokens.typography
  - All colors: Now pull from designTokens.colors
  - All buttons: Now use button.secondary preset  
  - Archived mission cards: Now use card preset
  - All spacing: Now use designTokens.spacing scale
  - All shadows: Now use designTokens.shadow
- **Commit:** 10a2da9

#### ⏳ MyJournal.jsx - PENDING
- **Expected Issues:**
  - Likely hardcoded typography sizes
  - Possible custom colors for status badges
  - Card styling may be inconsistent
- **Priority:** High (review interface)
- **Action:** Audit & apply tokens

#### ⏳ MyReviews.jsx - PENDING
- **Expected Issues:**
  - Filter buttons may have custom styling
  - Review cards likely need standardization
  - Pagination/list spacing inconsistencies
- **Priority:** High (review interface)
- **Action:** Audit & apply tokens

#### ⏳ DecisionTools.jsx - PENDING
- **Expected Issues:**
  - Tool category titles likely inconsistent
  - Tool cards may use custom shadows/spacing
  - CTA buttons may have custom styling
- **Priority:** High (main navigation)
- **Action:** Audit & apply tokens

---

### TIER 2 - Workflow Pages

#### ⏳ GrowStep1Goal.jsx - PENDING
- **Status:** designTokens import added
- **Expected Issues:**
  - Form labels likely using hardcoded sizing
  - Input styling may be custom
  - Section headings inconsistent
  - Action buttons non-standard
- **Priority:** High (core workflow)
- **Action:** Apply button, typography, input tokens

#### ⏳ GrowStep2Reality.jsx - PENDING
- **Expected Issues:** Same as GrowStep1Goal
- **Priority:** High
- **Action:** Match GrowStep1 token implementation pattern

#### ⏳ GrowStep3Options.jsx - PENDING
- **Expected Issues:** Form styling + option card styling
- **Priority:** High
- **Action:** Apply tokens + ensure card consistency

#### ⏳ GrowStep3bPrioritize.jsx - PENDING
- **Expected Issues:** Likely uses custom card borders/shadows for priority visualization
- **Priority:** High  
- **Action:** Standardize while preserving priority UX

#### ⏳ GrowStep4WillDo.jsx - PENDING
- **Expected Issues:** Summary styling, commitment display
- **Priority:** High
- **Action:** Apply tokens + verify summary layout

#### ⏳ IfThenPlanning.jsx - PENDING
- **Expected Issues:** If/Then section styling, condition cards
- **Priority:** Medium
- **Action:** Audit & apply consistent card styling

#### ⏳ ToughConversationStep1Feedback.jsx - PENDING
- **Expected Issues:** Feedback input area, coaching sections
- **Priority:** Medium
- **Action:** Apply typography & spacing tokens

#### ⏳ ToughConversationStep2Coaching.jsx - PENDING
- **Expected Issues:** Coaching guidance cards, action items
- **Priority:** Medium
- **Action:** Apply tokens + card standardization

#### ⏳ GoalSetting.jsx (Strategic Alignment) - PENDING
- **Expected Issues:** Goal definition form, success factors
- **Priority:** Medium
- **Action:** Form input standardization

#### ⏳ StopDoingAudit.jsx - PENDING
- **Expected Issues:** Activity cards, category sections
- **Priority:** Medium
- **Action:** Card & spacing consistency

#### ⏳ PlanMyDayStep1.jsx - PENDING
- **Expected Issues:** Priority/intention cards, goal section
- **Priority:** Medium
- **Action:** Apply tokens + card standardization

#### ⏳ PlanMeeting.jsx - PENDING
- **Expected Issues:** Meeting details form, agenda items
- **Priority:** Medium
- **Action:** Form & list item standardization

---

### TIER 3 - Summary/One-Pager Pages

#### ⏳ ReviewSummary.jsx - PENDING
- **Expected Issues:** One-pager layout, typography hierarchy, spacing
- **Priority:** Medium-High (PDF export)
- **Action:** Apply typography scale + print-friendly spacing

#### ⏳ DecisionSummary.jsx - PENDING
- **Expected Issues:** Decision details, rationale sections
- **Priority:** Medium-High (PDF export)
- **Action:** Apply tokens + verify PDF rendering

#### ⏳ DailyPlanSummary.jsx - PENDING
- **Expected Issues:** Daily goals, progress display
- **Priority:** Medium-High (PDF export)
- **Action:** Apply tokens + export formatting

#### ⏳ MeetingSummary.jsx - PENDING
- **Expected Issues:** Meeting details, action items
- **Priority:** Medium-High (PDF export)
- **Action:** Apply tokens + output formatting

#### ⏳ IfThenPlanningSummary.jsx - PENDING
- **Expected Issues:** If-Then scenarios display
- **Priority:** Medium (PDF export)
- **Action:** Apply tokens + one-pager layout

#### ⏳ StopDoingAuditSummary.jsx - PENDING
- **Expected Issues:** Activities list, priority display
- **Priority:** Medium (PDF export, also uses window.print())
- **Action:** Apply tokens + print CSS compatibility

#### ✅ MissionProgressReviewDetail.jsx - PARTIALLY COMPLIANT
- **Status:** Uses generateMissionProgressPDF (improved in PHASE 1)
- **Details:** PDF export styling already improved with print CSS
- **Action:** No change needed (PDF export handled separately)

---

### TIER 4 - Supporting Pages

#### ⏳ Login.jsx - PENDING
- **Status:** Audit shows multiple inconsistencies
- **Issues Found:**
  - H1: 48px bold (should be 36px, 700)
  - H2: 20px bold (should be 18px, 700)
  - Font weights: Using 'bold' instead of 700
  - Form labels: Hardcoded styling
  - Input fields: Hardcoded padding/border
  - Colors: Hardcoded #333, #999, #2e7d32
  - Button styling: Custom secondary styling
  - Background: #fafafa section border
- **Priority:** Medium (auth flow)
- **Action:** Apply typography, input, button tokens

#### ⏳ CreateAccount.jsx - PENDING
- **Expected Issues:** Same as Login.jsx (form styling)
- **Priority:** Medium (auth flow)
- **Action:** Match Login token implementation

#### ⏳ MyPlans.jsx - PENDING
- **Expected Issues:** Plan list cards, plan status display
- **Priority:** Low-Medium
- **Action:** Apply tokens + card standardization

#### ⏳ EditPersonalDetails.jsx - PENDING
- **Expected Issues:** Form styling, same as auth pages
- **Priority:** Low-Medium
- **Action:** Apply form input tokens

#### ⏳ BreathingPage.jsx - PENDING
- **Expected Issues:** Timer display, breathing guide cards
- **Priority:** Low
- **Action:** Audit & apply tokens

#### ⏳ TermsOfService.jsx / PrivacyPolicy.jsx - PENDING
- **Expected Issues:** Text content, link styling
- **Priority:** Low (legal pages, less interactive)
- **Action:** Light audit, ensure readability

---

## Common Patterns Found

### 1. Typography Inconsistencies
**Issue:** Pages use hardcoded font sizes instead of scale
- `font-size: 48px` (should use h1: 36px)
- `font-size: 20px` (should use h2: 18px)
- `font-size: 13px` (non-standard, should use bodySm: 14px or label: 12px)
- `font-weight: 'bold'` (should use 700)

**Fix Pattern:**
```javascript
// Before
<h1 style={{ fontSize: '48px', fontWeight: 'bold' }}>

// After
<h1 style={{ ...designTokens.typography.h1 }}>
```

### 2. Color Inconsistencies
**Issue:** Hardcoded hex values instead of token palette
- `color: '#333'` → use `designTokens.colors.text.primary`
- `color: '#666'` → use `designTokens.colors.text.secondary`
- `color: '#999'` → use `designTokens.colors.text.tertiary`
- `backgroundColor: '#f9f9f9'` → use `designTokens.colors.background.secondary`
- `border: '1px solid #e5e5e5'` → use `designTokens.colors.border.medium`

**Fix Pattern:**
```javascript
// Before
style={{ color: '#333', backgroundColor: '#f9f9f9' }}

// After
style={{ 
  color: designTokens.colors.text.primary,
  backgroundColor: designTokens.colors.background.secondary
}}
```

### 3. Spacing Inconsistencies
**Issue:** Random padding/margin values instead of 8px scale
- `padding: 10px` (non-standard)
- `margin: 20px` (should be 16px or 24px)
- `gap: 12px` (should be 8px or 16px)

**Fix Pattern:**
```javascript
// Before
style={{ padding: '20px', margin: '0 0 20px 0' }}

// After
style={{ 
  padding: designTokens.spacing.lg,
  marginBottom: designTokens.layout.gapBetweenSections
}}
```

### 4. Button Inconsistencies
**Issue:** Custom button styling instead of preset
- Mix of inline styles across buttons
- Inconsistent padding, colors, hover states
- Some use 'transparent' background, others use custom colors

**Fix Pattern:**
```javascript
// Before
style={{
  backgroundColor: 'transparent',
  border: '2px solid #F08571',
  color: '#F08571',
  padding: '10px 20px',
  ...
}}

// After
style={{ ...designTokens.button.secondary }}
```

### 5. Card Inconsistencies
**Issue:** Repeated card styling instead of preset
- Padding: mix of 16px, 18px, 20px
- Shadows: multiple custom values instead of sm/md/lg
- Border radius: mostly 8px but some 4px or 6px

**Fix Pattern:**
```javascript
// Before
style={{
  padding: '20px',
  backgroundColor: 'white',
  border: '1px solid #e5e5e5',
  borderRadius: '8px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}}

// After
style={{ ...designTokens.card }}
```

---

## Implementation Roadmap

### Phase 2a - Critical Pages (This session)
- [x] MyAccount.jsx - COMPLETED ✅
- [ ] Login.jsx - Priority high
- [ ] CreateAccount.jsx - Priority high

### Phase 2b - High-Traffic Pages  
- [ ] MyJournal.jsx
- [ ] MyReviews.jsx
- [ ] DecisionTools.jsx

### Phase 2c - Workflow Pages (GrowModel)
- [ ] GrowStep1Goal.jsx through GrowStep4WillDo.jsx
- Bulk update using pattern from Phase 2b

### Phase 2d - Other Workflows
- [ ] IfThenPlanning.jsx
- [ ] ToughConversation steps
- [ ] Strategic Alignment (GoalSetting.jsx)
- [ ] Stop Doing Audit

### Phase 2e - Summary Pages
- [ ] All summary one-pagers
- Verify PDF rendering with print.css

### Phase 2f - Supporting Pages
- [ ] MyPlans.jsx
- [ ] EditPersonalDetails.jsx
- [ ] BreathingPage.jsx
- [ ] Legal pages (low priority)

---

## Verification Checklist (Per Page)

When fixing a page, verify:

- [ ] All headings (H1/H2/H3/H4) use designTokens.typography
- [ ] All text colors use designTokens.colors (no hardcoded #hex)
- [ ] All padding/margins use designTokens.spacing (no random values)
- [ ] All border-radius use designTokens.borderRadius
- [ ] All shadows use designTokens.shadow (not custom values)
- [ ] All buttons use button.primary/secondary/tertiary presets
- [ ] All cards use designTokens.card preset
- [ ] All form inputs use designTokens.input preset
- [ ] All hover states use designTokens values
- [ ] designTokens imported at top of file
- [ ] No hardcoded color #hex values in inline styles
- [ ] No hardcoded font sizes in inline styles
- [ ] Spacing uses 8px scale (4, 8, 16, 24, 32, 48, 64px only)

---

## Testing Requirements

After applying tokens to each page:

1. **Visual Consistency Check**
   - Compare side-by-side with other pages
   - Headings should look consistent across app
   - Spacing should feel balanced
   - Colors should match palette

2. **Responsive Testing**
   - Desktop (1200px+)
   - Tablet (768px)
   - Mobile (375px)
   - Verify print CSS doesn't break layouts

3. **Hover/Interaction Testing**
   - Buttons respond correctly
   - Cards elevate on hover
   - Links underline/change color

4. **PDF Export Testing** (for summary pages)
   - Export to PDF
   - Verify no browser artifacts
   - Confirm layout is clean
   - Check page breaks

---

## Status Summary

| Category | Compliant | Pending | % Complete |
|----------|-----------|---------|------------|
| Core Pages (Tier 1) | 4/4 | 3 | 57% |
| Workflow Pages (Tier 2) | 0/12 | 12 | 0% |
| Summary Pages (Tier 3) | 1/7 | 6 | 14% |
| Supporting Pages (Tier 4) | 0/6 | 6 | 0% |
| **TOTAL** | **5/29** | **24** | **17%** |

---

## Next Steps

1. Continue with Tier 1 high-traffic pages (Login, CreateAccount, MyJournal, MyReviews)
2. Bulk-apply token pattern to Tier 2 workflow pages
3. Verify all summary pages work with print.css
4. Final pass: Compare all pages side-by-side for visual consistency
5. Prepare for dark mode (Phase 3)

