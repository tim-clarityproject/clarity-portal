# Clarity Portal Backend - Quick Start

## Overview

You now have a complete backend integration ready to deploy your MVP. Here's what's set up:

- **Database**: PostgreSQL (via Supabase)
- **Authentication**: Email + Google/Facebook logins (via Supabase Auth)
- **API**: Auto-generated REST API from Supabase
- **Data Persistence**: Plans, responses, user profiles

## What's New

### Files Created

1. **`supabase/schema.sql`** — Complete database schema with:
   - `profiles` table (user info)
   - `plans` table (saved assessments)
   - `guest_sessions` table (guest data before signup)
   - Row-level security policies
   - Auto-update triggers

2. **`src/lib/supabase.js`** — Client library with helper functions:
   - `auth.signUp()`, `auth.signIn()`, `auth.signOut()`
   - `plans.savePlan()`, `plans.updatePlan()`, `plans.getUserPlans()`
   - `guestSessions.createSession()`, `guestSessions.updateSession()`

3. **`src/context/AuthContext.jsx`** — Updated to use Supabase auth:
   - Manages current user state
   - Listens for auth changes
   - Provides `login`, `signup`, `logout` methods

4. **`src/pages/Login.jsx`** — Updated to use real authentication:
   - Calls Supabase auth on form submit
   - Shows error messages
   - Loading state on submit button

5. **`src/pages/MyAccount.jsx`** — Updated to fetch real plans:
   - Loads user's saved plans from database
   - Shows loading state
   - Empty state when no plans

## Setup Steps (5 minutes)

### Step 1: Create Supabase Project

1. Go to https://supabase.com
2. Click **New Project**
3. Sign up or log in
4. Name it: `clarity-portal`
5. Choose a region near you
6. Click **Create new project**
7. Wait 2-3 minutes for it to initialize

### Step 2: Get API Credentials

Once the project loads:

1. Click **Settings** (bottom left)
2. Click **API** (left sidebar)
3. Copy **Project URL** (starts with `https://`)
4. Copy **anon public** key (long string)

### Step 3: Create .env.local

In your project root (`/Users/timdutton/Desktop/clarity-portal/`), create a new file called `.env.local`:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Paste your actual credentials from Step 2.

### Step 4: Initialize Database Schema

1. Back in Supabase, click **SQL Editor** (left sidebar)
2. Click **New Query**
3. Click the folder icon to **Open file**
4. Select `/Users/timdutton/Desktop/clarity-portal/supabase/schema.sql`
5. Click **Run** (top right)
6. Wait for it to complete (should see "✓ Success")

### Step 5: Install Supabase Package

In your terminal:

```bash
cd /Users/timdutton/Desktop/clarity-portal
npm install
```

This will install the Supabase client package.

### Step 6: Start Dev Server

```bash
npm run dev
```

Your app is now connected to Supabase!

## Test It Out

1. Go to http://localhost:5174
2. Click **Sign up** and create an account with any email
3. After login, you should see the Welcome page
4. Complete a plan (go through all the steps)
5. Click hamburger menu → **My Account**
6. You should see your saved plan with progress

## What Happens Behind the Scenes

### Sign Up Flow
```
User enters email/password
↓
Supabase Auth creates user + session
↓
Profiles table auto-populated (via trigger)
↓
User redirected to /welcome
```

### Save Plan Flow
```
User completes form → clicks Continue
↓
Form data stored in Context
↓
Results page: "Save Plan" button → calls plans.savePlan()
↓
Supabase stores plan with user_id + form_data (JSON)
↓
My Account page fetches with plans.getUserPlans(user.id)
```

### Guest → Account Flow
```
Guest completes form (stored in localStorage)
↓
Guest clicks "Create Account" in menu
↓
Guest data transferred to new account
↓
User now authenticated (isGuest = false)
```

## Next Steps (When You're Ready)

1. **Deploy frontend to Vercel**
   - Push code to GitHub
   - Connect to Vercel
   - Auto-deploys on push

2. **Enable OAuth (Google/Facebook)**
   - Go to Supabase → Authentication → Providers
   - Get credentials from Google Cloud Console / Facebook
   - Paste into Supabase (only 2 fields per provider)

3. **Add more features**
   - Email verification
   - Password reset
   - User preferences
   - Plan sharing
   - Analytics

## Troubleshooting

**"Missing Supabase credentials"**
- Make sure `.env.local` file exists in project root
- Restart dev server after adding credentials

**"Database error" on save**
- Check that schema.sql ran successfully (Step 4)
- Go to Supabase → SQL Editor → double-click on schema to verify

**"Permission denied" error**
- This means Row-Level Security is working
- Make sure you're logged in when accessing protected pages

**Blank My Account page**
- Wait a few seconds, it's loading from database
- Check browser console for errors

## Questions?

Check `/Users/timdutton/Desktop/clarity-portal/SUPABASE_SETUP.md` for more details.
