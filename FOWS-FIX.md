# Flash of White Screen (FOWS) & Layout Shift Fixes

## Changes Made

### 1. **PageLoader Component** ✅
**File**: `NUMBER9/src/components/ui/PageLoader.jsx`

- Created skeleton loading component with animated placeholders
- Shows while pages fetch data asynchronously
- Prevents white screen/blank layout during initial load

### 2. **CSS Animations & Layout Containment** ✅
**File**: `NUMBER9/src/index.css`

Added:
- `@keyframes fade-in` — smooth page transition (0.25s)
- `.animate-fade-in` — applies fade animation to loaded content
- `contain: layout style paint` on `<main>` — prevents layout shift (CLS)
- `min-height: 100%` on `<main>` — reserves space, no layout jump

### 3. **DashboardPage Loading State** ✅
**File**: `NUMBER9/src/pages/DashboardPage.jsx`

- Added `isLoading` state (default: `true`)
- Set to `false` after `fetchUserTransactions` completes
- Shows `<PageLoader />` while loading
- Displays full dashboard after data arrives

## Result

| Before | After |
|--------|-------|
| ❌ White flash on route change | ✅ Smooth skeleton → content fade |
| ❌ Content appears suddenly | ✅ Skeleton placeholder loading state |
| ❌ Layout shifts as data loads | ✅ CSS containment reserves space |
| ❌ Delayed perceived performance | ✅ Instant visual feedback |

## How to Apply to Other Pages

Each page that fetches data should:

```jsx
import PageLoader from '../components/ui/PageLoader'

export default function YourPage() {
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => {
    fetchSomeData().then(() => setIsLoading(false))
  }, [])
  
  if (isLoading) {
    return <PageShell><PageLoader /></PageShell>
  }
  
  return <PageShell>/* your content */</PageShell>
}
```

## Files Modified

1. ✅ `src/components/ui/PageLoader.jsx` — Created
2. ✅ `src/index.css` — Added animations & containment
3. ✅ `src/pages/DashboardPage.jsx` — Added loading state

## Next Steps

Apply the same pattern to pages that fetch async data:
- `GamePage.jsx` — fetches bets/results
- `WalletPage.jsx` — fetches balance/transactions
- `HistoryPage.jsx` — fetches betting history
- `DepositPage.jsx` / `WithdrawPage.jsx` — fetch transaction list
- Any page with `useEffect` + `useState` for data

---

**Status**: ✅ Ready to test at http://localhost:5175
