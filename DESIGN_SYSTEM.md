# Clarity Portal Design System

**Version:** 1.0  
**Last Updated:** 2026-09-23  
**Status:** Core tokens defined; Phase 2 rollout in progress

## Overview

This is the official design system for Clarity Portal. All pages must use these tokens instead of hardcoded values to ensure:
- Visual consistency across the entire platform
- Easy dark-mode implementation (swap token values)
- Maintainability and scalability
- Premium, cohesive brand experience

## Token File Location

All tokens are defined in: `src/lib/designTokens.js`

Import in any page:
```javascript
import { designTokens, applyTypography, getButtonStyle } from '../lib/designTokens';
```

## Using Design Tokens

### Typography

Replace hardcoded font sizes/weights with token objects:

**Before:**
```jsx
<h1 style={{ fontSize: '36px', fontWeight: '700', lineHeight: '1.3' }}>Title</h1>
```

**After:**
```jsx
<h1 style={{ ...designTokens.typography.h1 }}>Title</h1>
```

**Available variants:**
- `h1` - Page hero, large headings (36px, 700, 1.3 line-height)
- `h2` - Section headings (18px, 700, uppercase, 0.5px letter-spacing)
- `h3` - Card headings (18px, 700)
- `h4` - Smaller sections (16px, 600)
- `body` - Main text (15px, 400, 1.6 line-height)
- `bodySm` - Secondary text (14px, 400)
- `label` - Form labels (12px, 600, uppercase)
- `caption` - Small text (11px, 400)
- `button` - Button text (14px, 600)

### Colors

Replace hardcoded color values:

**Before:**
```jsx
<div style={{ color: '#333', backgroundColor: '#F08571' }}>Content</div>
```

**After:**
```jsx
<div style={{ color: designTokens.colors.text.primary, backgroundColor: designTokens.colors.primary }}>Content</div>
```

**Available colors:**
- `primary` - #F08571 (coral, all CTAs/accents)
- `text.primary` - #333 (main body text)
- `text.secondary` - #666 (secondary text)
- `text.tertiary` - #999 (placeholder, disabled)
- `text.disabled` - #bbb (very light text)
- `text.inverse` - white (on dark backgrounds)
- `background.default` - white (page background)
- `background.secondary` - #f9f9f9 (light cards/sections)
- `border.light` - #f0f0f0 (dividers)
- `border.medium` - #e5e5e5 (card borders)
- `border.focus` - #F08571 (same as primary)

### Spacing

Replace hardcoded padding/margin values:

**Before:**
```jsx
<div style={{ padding: '32px', margin: '0 0 48px 0' }}>
```

**After:**
```jsx
<div style={{ padding: designTokens.spacing.xl, marginBottom: designTokens.layout.gapBetweenSections }}>
```

**Available spacing:**
- `xs` - 4px
- `sm` - 8px
- `md` - 16px
- `lg` - 24px
- `xl` - 32px
- `xxl` - 48px
- `xxxl` - 64px

**Layout presets:**
- `layout.gapBetweenSections` - 48px (space between major sections)
- `layout.gapBetweenCards` - 24px (space between cards in grid/list)
- `layout.contentPadding` - "64px 32px" (desktop page padding)
- `layout.contentPaddingMobile` - "32px 16px" (mobile page padding)

### Border Radius

Replace hardcoded border-radius values:

**Before:**
```jsx
<div style={{ borderRadius: '8px' }}>
```

**After:**
```jsx
<div style={{ borderRadius: designTokens.borderRadius.lg }}>
```

**Available values:**
- `sm` - 3px (small components)
- `md` - 4px (inputs, small elements)
- `lg` - 8px (cards, buttons) — **most common**
- `xl` - 16px (large modals)
- `xxl` - 24px (extra large)

### Shadows

Replace hardcoded box-shadow values:

**Before:**
```jsx
<div style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)' }}>
```

**After:**
```jsx
<div style={{ boxShadow: designTokens.shadow.sm }}>
```

**Available shadows:**
- `none` - no shadow
- `sm` - Light shadow (cards at rest)
- `md` - Medium shadow (cards on hover)
- `lg` - Large shadow (modals, prominent elements)
- `coral` - Coral tint (accent elements like mission panel)

### Buttons

Use preset button styles instead of inline styles:

**Before:**
```jsx
<button style={{
  padding: '14px 24px',
  backgroundColor: '#F08571',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  fontWeight: '600',
  cursor: 'pointer',
}}>Click Me</button>
```

**After:**
```jsx
<button style={{ ...designTokens.button.primary }}>Click Me</button>
```

**Available button variants:**
- `button.primary` - Coral background, white text (main CTAs)
- `button.secondary` - White background, gray text, gray border (secondary actions)
- `button.tertiary` - Transparent background, tertiary text (less prominent actions)

**Hover states example:**
```jsx
<button
  style={{ ...designTokens.button.primary }}
  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = designTokens.button.primary.hoverBackgroundColor}
  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = designTokens.colors.primary}
>
  Click Me
</button>
```

### Cards

Use preset card styling for consistency:

**Before:**
```jsx
<div style={{
  padding: '20px',
  backgroundColor: 'white',
  border: '1px solid #e5e5e5',
  borderRadius: '8px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
}}>
```

**After:**
```jsx
<div style={{ ...designTokens.card }}>
```

## Pages Completed ✅

- [ ] About.jsx
- [ ] PersonalOperatingPlan.jsx
- [ ] Welcome.jsx

## Pages Pending (Priority Order)

### Tier 1 - High Traffic Pages
- [ ] MyAccount.jsx - User profile/settings (many interactions)
- [ ] MyJournal.jsx - Review log
- [ ] MyReviews.jsx - Review filters
- [ ] DecisionTools.jsx - Main decision tool menu

### Tier 2 - Workflow Pages
- [ ] GrowStep1Goal.jsx through GrowStep4WillDo.jsx
- [ ] IfThenPlanning.jsx
- [ ] ToughConversationStep1Feedback.jsx, Step2Coaching.jsx
- [ ] GoalSetting.jsx (strategic alignment)
- [ ] StopDoingAudit.jsx
- [ ] PlanMyDayStep1.jsx
- [ ] PlanMeeting.jsx

### Tier 3 - Summary Pages
- [ ] ReviewSummary.jsx
- [ ] DecisionSummary.jsx
- [ ] DailyPlanSummary.jsx
- [ ] MeetingSummary.jsx
- [ ] IfThenPlanningSummary.jsx
- [ ] StopDoingAuditSummary.jsx

### Tier 4 - Supporting Pages
- [ ] MyPlans.jsx
- [ ] EditPersonalDetails.jsx
- [ ] BreathingPage.jsx
- [ ] CreateAccount.jsx
- [ ] Login.jsx

## Quick Replacement Patterns

### Pattern 1: Replace color values
Find: `color: '#333'` → Replace: `color: designTokens.colors.text.primary`
Find: `color: '#666'` → Replace: `color: designTokens.colors.text.secondary`
Find: `color: '#999'` → Replace: `color: designTokens.colors.text.tertiary`
Find: `backgroundColor: '#f9f9f9'` → Replace: `backgroundColor: designTokens.colors.background.secondary`
Find: `backgroundColor: '#F08571'` → Replace: `backgroundColor: designTokens.colors.primary`

### Pattern 2: Replace spacing values
Find: `padding: '32px'` → Replace: `padding: designTokens.spacing.xl`
Find: `margin: '0 0 48px 0'` → Replace: `marginBottom: designTokens.layout.gapBetweenSections`
Find: `gap: '24px'` → Replace: `gap: designTokens.layout.gapBetweenCards`

### Pattern 3: Replace border values
Find: `border: '1px solid #e5e5e5'` → Replace: `border: \`1px solid ${designTokens.colors.border.medium}\``
Find: `borderRadius: '8px'` → Replace: `borderRadius: designTokens.borderRadius.lg`

### Pattern 4: Replace typography
Find: `fontSize: '36px', fontWeight: '700', lineHeight: '1.3'` → Replace: `...designTokens.typography.h1`
Find: `fontSize: '18px', fontWeight: '700'` → Replace: `...designTokens.typography.h3`
Find: `fontSize: '15px', fontWeight: '400'` → Replace: `...designTokens.typography.body`

## Testing Checklist

After applying tokens to a page:
- [ ] Import designTokens at top
- [ ] Replace all hardcoded font sizes, weights, line-heights with typography tokens
- [ ] Replace all color #hex values with color tokens
- [ ] Replace padding/margin hardcoded values with spacing tokens
- [ ] Replace border-radius hardcoded values with radius tokens
- [ ] Replace box-shadow hardcoded values with shadow tokens
- [ ] Use button presets for all buttons
- [ ] Use card presets for all card components
- [ ] Check hover states use token values
- [ ] Test on desktop (1200px+) and mobile (375px)
- [ ] Verify colors match intended palette
- [ ] Verify spacing feels consistent with other pages

## Next Steps

1. **Complete Tier 1 pages** (MyAccount, MyJournal, MyReviews, DecisionTools)
2. **Complete Tier 2 pages** (All workflow/decision tool pages)
3. **Complete Tier 3 pages** (Summary/one-pager pages)
4. **Complete Tier 4 pages** (Supporting pages)
5. **Full site audit** - Walk through every page comparing visual consistency
6. **PDF export audit** - Ensure one-pagers and PDFs reflect design system
7. **Dark mode implementation** - Swap token values for dark palette

## Dark Mode (Future)

Once all pages use tokens, dark mode is trivial:
1. Create `designTokens.dark.js` with dark color palette
2. Update `designTokens.js` to conditionally export based on theme setting
3. All pages automatically update (no individual page changes needed)

## Questions / Support

When applying tokens:
- Look at `designTokens.js` for exact values and helper functions
- Check recently completed pages (About, PersonalOperatingPlan, Welcome) for patterns
- Use template patterns above for common find/replace operations
