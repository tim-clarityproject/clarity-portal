# Data Persistence Root Cause Analysis

## Current Symptoms
- Fresh GROW decisions still show old priority order options on Step 3b
- Fresh GROW decisions show old constraint/opportunity data
- FormContext localStorage is NOT being cleared even with `localStorage.removeItem('clarity_form_data')`

## Investigation Areas

### 1. FormContext Implementation
- Uses single shared key: `'clarity_form_data'`
- No per-workflow isolation
- All workflows read/write same key
- **Problem**: When new decision starts, old workflow's data is in localStorage with same key

### 2. State Initialization Flow
- `useState(() => location.state?.value || [])`
- No getFieldValue fallback (just removed)
- But component might read FormContext AFTER mount
- **Issue**: FormContext might be re-hydrating from localStorage AFTER component initializes

### 3. Clearing Logic
```javascript
useEffect(() => {
  if (!location.state?.decisionId && !location.state?.options) {
    localStorage.removeItem('clarity_form_data');
  }
}, []);
```
- Only runs once on mount (empty dependency array)
- Only clears if BOTH conditions true
- **Problem**: By the time this runs, React has already rendered with old data

### 4. Component Mount Timing
1. Component mounts
2. useState initializer runs → reads location.state (no old data) → sets empty array
3. Component renders with empty array
4. useEffect runs → clears localStorage
5. **Issue**: Steps between 2-4, FormContext might still have old data in memory

### 5. FormContext Re-hydration - THE ROOT CAUSE
```javascript
function loadFromStorage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : DEFAULT_FORM_DATA;
}

const [formData, setFormData] = useState(loadFromStorage);
```
- Context loads from localStorage at PROVIDER mount (App.jsx root)
- Provider mounted at app root - PERSISTS ACROSS PAGE NAVIGATION
- **CRITICAL ISSUE**: Provider holds old data in memory; clearing localStorage has NO EFFECT on the already-loaded formData in the provider
- The formData state in FormContext is READ ONCE and NEVER UPDATED from localStorage again

### 6. Navigation Behavior
- Welcome → GrowStep1: Provider still has old GROW data from previous decision
- User fills Step 1-3b without saving
- New session: Welcome → GrowStep1 again
- Provider STILL HAS OLD DATA in memory because context provider never unmounted

## Root Cause Summary

**THE FORMCONTEXT PROVIDER AT APP ROOT IS NEVER UNMOUNTING**

It loads data from localStorage once on app start, and that data persists in memory for the entire app lifetime. Simply clearing localStorage has NO EFFECT on the already-loaded formData in the provider.

When a new decision starts:
1. localStorage is cleared (but too late, already loaded into context state)
2. Component reads location.state (empty for fresh decision)
3. Component might read FormContext via updateFormData() or other context operations (HAS OLD DATA)
4. Component displays old data

## Why Removing getFieldValue() Didn't Work

The useState initializers no longer have getFieldValue fallbacks, so they DON'T read from FormContext on mount. But:
- Some components STILL use `updateFormData()` which WRITES TO the in-memory FormContext state
- Components still CALL updateFormData() even though we removed the read fallback
- The context provider itself holds stale data from app boot that never gets cleared

## Evidence Chain

1. **localStorage.removeItem() not working**: Because FormContext already loaded the data into its STATE at app boot
2. **getFieldValue() removal not working**: Because the IN-MEMORY FormContext (not localStorage) has the data
3. **Clearing useEffect not working**: Because it only clears localStorage, not the in-memory context.formData state
4. **Fresh decisions showing old data**: Because FormContext provider at app root never cleared its state

## Why This Happens

The app architecture:
1. App.jsx mounts FormProvider at root
2. FormProvider.useState(() => loadFromStorage()) loads from localStorage ONCE
3. Navigation between pages does NOT unmount the provider
4. formData state in context is never updated from localStorage again (one-time load)
5. Clearing localStorage has zero effect on formData that's already in React state
6. New decision loads → reads FormContext → sees old data from app boot

When a user:
1. Completes Decision #1 (data saved to database, formData updated in context state)
2. Navigates back to Welcome
3. Starts Decision #2
4. The FormContext formData state STILL HAS Decision #1's data
5. Components read from context and display old data

## Fix Priority for Tomorrow

**QUICK FIX** (handles 80% of issue):
1. Add `clearFormData()` call in Welcome component when starting new decision
2. This clears the in-memory formData state in FormContext
3. All steps will then read empty context

**PROPER FIX** (handles 100% of issue):
1. Separate storage keys per workflow type (e.g., 'clarity_form_data_grow', 'clarity_form_data_inversion')
2. Only load relevant workflow's data
3. Clear relevant context on fresh decision start

**REAL SOLUTION** (architectural fix):
1. Refactor to NOT use FormContext for cross-session data persistence
2. FormContext should only hold in-progress decision data (cleared on fresh start)
3. Use database + location.state for all persistent data
4. Remove localStorage persistence from FormContext entirely

## Files to Check Tomorrow
- `src/context/FormContext.jsx` - Where loadFromStorage() initializes state
- `src/pages/Welcome.jsx` - Where `clearFormData()` should be called
- All decision step files - Remove any remaining context reads for fresh decisions
- `src/App.jsx` - FormProvider mounting point
