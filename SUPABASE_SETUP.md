# Supabase Setup Guide for Clarity Portal

## Step 1: Create Supabase Project

1. Go to https://supabase.com and sign up (free)
2. Create a new project (name it "clarity-portal")
3. Choose a region closest to you
4. Wait for the project to initialize (~2 min)

## Step 2: Get Your Credentials

Once the project loads:
1. Go to **Settings** → **API**
2. Copy your **Project URL** and **anon public key**
3. Create a `.env.local` file in your React project root:

```
VITE_SUPABASE_URL=your_project_url_here
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

## Step 3: Set Up Database Schema

1. In Supabase, go to **SQL Editor**
2. Click **New Query**
3. Paste the entire contents of `supabase/schema.sql`
4. Click **Run**

## Step 4: Configure Google OAuth (Optional, for later)

1. Go to **Authentication** → **Providers**
2. Enable Google
3. Add your OAuth credentials (you'll get these from Google Cloud Console)

## Step 5: Install Supabase Client

```bash
cd /Users/timdutton/Desktop/clarity-portal
npm install @supabase/supabase-js
```

## Step 6: Update Environment

Restart your dev server after adding `.env.local`:

```bash
npm run dev
```

Your React app will now have access to Supabase credentials via `import.meta.env.VITE_SUPABASE_URL`

## That's it!

The React integration files are ready to use. Once you run `npm run dev`, the app will:
- Route unauthenticated users to Login
- Create accounts via email or Google
- Save plans to the database
- Load saved plans on My Account page
