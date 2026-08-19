# Backend Infrastructure Setup - Complete

## ✅ What's Been Done

Your React app now has a complete backend infrastructure ready for deployment. Here's exactly what was set up:

### 1. Database Schema (PostgreSQL via Supabase)
- **File**: `supabase/schema.sql`
- **Tables**:
  - `profiles` — User info (extends Supabase auth)
  - `plans` — Saved assessment plans with full form data (JSON)
  - `guest_sessions` — Guest data before signup
- **Security**: Row-level security (RLS) policies protect user data
- **Triggers**: Auto-update timestamps, auto-populate profiles on signup

### 2. Supabase Client Library
- **File**: `src/lib/supabase.js`
- **Functions**:
  - Authentication: `signup()`, `signin()`, `signout()`, `getCurrentUser()`
  - Plans CRUD: `savePlan()`, `updatePlan()`, `getUserPlans()`, `deletePlan()`
  - Guest sessions: `createSession()`, `updateSession()`, `getSession()`
- **No manual SQL needed** — All database operations use these functions

### 3. Updated React Components

#### AuthContext (`src/context/AuthContext.jsx`)
- Manages current user state
- Listens for auth changes automatically
- Provides `user`, `login()`, `signup()`, `logout()`
- Used by all pages that need auth

#### Login Page (`src/pages/Login.jsx`)
- Real Supabase authentication
- Email/password signup + login
- Error messages
- Loading state on submit

#### MyAccount Page (`src/pages/MyAccount.jsx`)
- Fetches user's saved plans from Supabase
- Displays plan progress, dates, status
- Empty state when no plans yet
- Loading state while fetching

#### Results Page (`src/pages/Results.jsx`)
- "Save & Finish" button saves plan to Supabase
- Shows success message
- Redirects to My Account after save
- Only shows for logged-in users

### 4. Dependencies Updated
- Added `@supabase/supabase-js` to `package.json`
- Ready to install: `npm install`

## 🚀 Next: Get It Running (5 steps)

### Step 1: Create Supabase Project
- Go to https://supabase.com
- Create new project named `clarity-portal`
- Choose region nearest to you
- Wait for initialization (~2 min)

### Step 2: Get Credentials
1. In Supabase dashboard, click **Settings** → **API**
2. Copy **Project URL** (looks like `https://xxxx.supabase.co`)
3. Copy **anon public** key

### Step 3: Create .env.local
Create a file at `/Users/timdutton/Desktop/clarity-portal/.env.local`:

```
VITE_SUPABASE_URL=your-url-from-step-2
VITE_SUPABASE_ANON_KEY=your-key-from-step-2
```

### Step 4: Initialize Database
1. In Supabase, go to **SQL Editor** → **New Query**
2. Open file: `/Users/timdutton/Desktop/clarity-portal/supabase/schema.sql`
3. Run it (hit the Run button)
4. Wait for "✓ Success"

### Step 5: Install & Run
```bash
cd /Users/timdutton/Desktop/clarity-portal
npm install
npm run dev
```

Done! Go to http://localhost:5174 and test signup/login.

## 🧪 Test Checklist

Try these in order:

1. **Sign Up**
   - [ ] Create new account with email/password
   - [ ] Successfully logged in and see Welcome page

2. **Complete a Plan**
   - [ ] Go through all form pages (Choose Focus → Results)
   - [ ] Click "Save & Finish" on Results page
   - [ ] See "Plan saved successfully" message

3. **Access Saved Plans**
   - [ ] Click hamburger menu → My Account
   - [ ] See your saved plan in the list
   - [ ] Status shows "In Progress" and progress bar

4. **Guest Flow (Optional)**
   - [ ] Click "Guest User" on login
   - [ ] Go through a few form pages
   - [ ] Click "Create Account" in menu
   - [ ] Create account (data persists)
   - [ ] Now see saved plans in My Account

## 📊 Data Flow Examples

### When User Signs Up
```
Login page → enter email/password
↓
auth.signup() calls Supabase
↓
Supabase creates user + session
↓
Trigger fires: profiles table auto-populated
↓
AuthContext updates with user
↓
React redirects to /welcome
```

### When User Saves a Plan
```
User completes results page
↓
Clicks "Save & Finish"
↓
Results.jsx calls plans.savePlan(userId, planName, planType, formData)
↓
Supabase stores in plans table with RLS check (must own it)
↓
Success message shows
↓
Redirects to /my-account
↓
MyAccount.jsx fetches plans.getUserPlans(userId)
↓
User sees their plan in list
```

### When User Logs Out
```
Click "Log Out" in menu
↓
HomeHeader calls logout() from AuthContext
↓
auth.signOut() calls Supabase
↓
Supabase clears session
↓
AuthContext updates (user = null)
↓
Router redirects to /welcome or /login
```

## 🔐 Security Features Built In

1. **Row-Level Security (RLS)**
   - Users can only see/edit their own plans
   - Database enforces this, not just frontend

2. **Session Management**
   - Supabase handles session tokens
   - Auto-expires old sessions

3. **Password Hashing**
   - Supabase uses bcrypt (industry standard)
   - Passwords never stored in plain text

4. **No API Keys in Frontend**
   - Uses "anon" key (read-only by default)
   - RLS policies control access

## 🔧 Troubleshooting

### "Missing Supabase credentials"
**Problem**: App won't connect to database
**Solution**: 
- Check `.env.local` exists in project root
- Verify URLs/keys are copied correctly
- Restart dev server: `npm run dev`

### Login fails silently
**Problem**: Click login but nothing happens
**Solution**:
- Check browser console for errors (F12)
- Verify `.env.local` has correct credentials
- Make sure schema.sql ran successfully in Supabase

### Can't see saved plans
**Problem**: My Account page is empty
**Solution**:
- Verify you're logged in (not guest)
- Check database: Supabase → Table Editor → plans table
- Look for your user_id in the table

### "Permission denied" error
**Problem**: Saving fails with auth error
**Solution**:
- This is RLS working correctly
- Make sure you're logged in (user exists)
- Check that user_id in plans matches logged-in user

## 📝 What Each File Does

| File | Purpose |
|------|---------|
| `supabase/schema.sql` | Database tables, indexes, policies, triggers |
| `src/lib/supabase.js` | Reusable auth & database functions |
| `src/context/AuthContext.jsx` | Global user state management |
| `.env.local` | Supabase credentials (you create this) |
| `src/pages/Login.jsx` | Real signup/login with Supabase |
| `src/pages/MyAccount.jsx` | Fetch & display saved plans |
| `src/pages/Results.jsx` | Save completed plan to database |

## 🎯 What's Ready to Deploy

Your MVP is **production-ready** once you:

1. ✅ Run setup steps above
2. ✅ Test signup/login/save plan
3. ✅ Push code to GitHub
4. ✅ Deploy frontend to Vercel
5. ⏳ (Optional) Enable Google/Facebook OAuth in Supabase

## 🚀 After Setup

Once everything is working:

1. **Deploy to Vercel**
   ```bash
   git push  # triggers auto-deploy
   ```

2. **Get Real Feedback** 
   - Share link with beta users
   - They can sign up and try it
   - You see their saved plans in Supabase

3. **Add Features Based on Feedback**
   - Email verification
   - Password reset
   - Plan sharing
   - Analytics
   - etc.

---

**Questions?** See `/Users/timdutton/Desktop/clarity-portal/BACKEND_QUICKSTART.md` for more details.

**Ready?** Follow the 5 setup steps above and you'll be live in ~15 minutes.
