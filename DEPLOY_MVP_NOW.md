# Deploy Your MVP in 3 Steps

Everything is ready. Follow this checklist to go live.

## Step 1️⃣: Supabase Setup (5 minutes)

### Create Project
- [ ] Go to https://supabase.com/sign-up
- [ ] Click **New Project**
- [ ] Name: `clarity-portal`
- [ ] Region: (pick one near you)
- [ ] Wait for it to initialize

### Get Credentials
- [ ] Click **Settings** → **API** (left sidebar)
- [ ] Copy **Project URL** 
- [ ] Copy **anon public** key
- [ ] Don't close this yet!

### Initialize Database
- [ ] Still in Supabase, click **SQL Editor** → **New Query**
- [ ] Click folder icon to open file
- [ ] Select: `/Users/timdutton/Desktop/clarity-portal/supabase/schema.sql`
- [ ] Click **Run** button
- [ ] Wait for ✓ Success message

## Step 2️⃣: Local Setup (5 minutes)

### Create Environment File
- [ ] Create file: `/Users/timdutton/Desktop/clarity-portal/.env.local`
- [ ] Paste this, replacing the values:
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-long-anon-key-here
```

### Install Dependencies
- [ ] Open terminal
- [ ] Run: `cd /Users/timdutton/Desktop/clarity-portal`
- [ ] Run: `npm install`
- [ ] Wait for it to finish

### Start Dev Server
- [ ] Run: `npm run dev`
- [ ] You should see: `Local: http://localhost:5174`
- [ ] Go to that URL in your browser

## Step 3️⃣: Test It Works (5 minutes)

### Test Signup
- [ ] You're on the Login page
- [ ] Click **"Don't have an account? Sign up"**
- [ ] Enter any email: `test@example.com`
- [ ] Enter password: `password123`
- [ ] Click **Create Account**
- [ ] Should redirect to Welcome page ✓

### Test Saving a Plan
- [ ] Click **Let's Go**
- [ ] Select **Me** (personal)
- [ ] Fill in any text for "What are you hoping to achieve?"
- [ ] Click **Continue** (go through all pages, just fill anything)
- [ ] On Results page: Click **Save & Finish**
- [ ] You should see "Plan saved successfully!" ✓

### Test My Account
- [ ] Click hamburger menu (three lines)
- [ ] Click **My Account** (only visible if logged in)
- [ ] You should see your saved plan! ✓
- [ ] Shows: name, type, progress, dates, status

## You're Live! 🎉

Everything is working. Now you can:

1. **Test with real users**
   - Deploy to Vercel (instructions below)
   - Send them the link
   - They can sign up and try it
   - Their plans are saved in your database

2. **Make changes** 
   - Edit React code
   - Save file
   - Dev server auto-reloads
   - Try it in browser

3. **Check the data**
   - Go to Supabase dashboard
   - Click **Table Editor**
   - Click **plans** table
   - See all users' saved plans (with their form data)

## Deploy to Vercel (Optional - for Real Users)

When you're ready to share with people:

### Step 1: Push to GitHub
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/clarity-portal
git push -u origin main
```

### Step 2: Deploy to Vercel
- [ ] Go to https://vercel.com
- [ ] Sign in with GitHub
- [ ] Click **Add New** → **Project**
- [ ] Select your `clarity-portal` repo
- [ ] Click **Import**
- [ ] Add environment variables:
  - `VITE_SUPABASE_URL` = your Supabase URL
  - `VITE_SUPABASE_ANON_KEY` = your anon key
- [ ] Click **Deploy**
- [ ] Wait ~2 minutes
- [ ] Get a live URL (like `clarity-portal-abc123.vercel.app`)

### Step 3: Share the Link
- [ ] Send your Vercel URL to friends/users
- [ ] They can sign up and use it
- [ ] Their data is saved in your Supabase database

## Troubleshooting

### "npm install" fails
**Problem**: npm can't install packages
**Solution**: 
```bash
npm cache clean --force
rm package-lock.json
npm install
```

### Dev server won't start
**Problem**: `npm run dev` shows errors
**Solution**: 
- Check `.env.local` exists with correct values
- Restart terminal
- Try: `npm install` again

### Can't log in
**Problem**: Signup/login doesn't work
**Solution**:
- Check browser console (F12 → Console tab)
- Look for red error messages
- Verify `.env.local` has your Supabase credentials
- Make sure schema.sql ran in Supabase (check SQL Editor history)

### Plans don't save
**Problem**: "Save & Finish" does nothing
**Solution**:
- Make sure you're logged in (not guest)
- Check browser console for errors
- Verify Supabase project URL in `.env.local` is correct

## What's Included

✅ User authentication (email + password)
✅ Plan saving & loading
✅ Multi-user support (each user's data isolated)
✅ Guest mode (still works)
✅ Full form data persistence
✅ My Account page with saved plans
✅ Security (Row-Level Security on database)

## What's Next (After MVP)

### For More Users
- [ ] Deploy to Vercel (see above)
- [ ] Enable Google/Facebook login (Supabase settings)
- [ ] Create privacy/terms pages
- [ ] Set up email verification

### For More Features
- [ ] Email notifications
- [ ] Plan sharing between team members
- [ ] Progress tracking over time
- [ ] Export plans as PDF
- [ ] Real-time collaboration

### For Better Data
- [ ] Analytics dashboard
- [ ] User feedback form
- [ ] Usage metrics
- [ ] Plan templates

## 🎯 You're Ready!

You've gone from frontend-only to a complete backend infrastructure. Users can now:

1. ✅ Create accounts
2. ✅ Fill out assessment plans
3. ✅ Save their work
4. ✅ Return later and continue

**Everything is production-ready.** Follow the checklist above and you'll be live in 15 minutes.

---

**Still need help?** Read these in order:
1. FILES_SUMMARY.md — Overview of what was created
2. BACKEND_SETUP_COMPLETE.md — Detailed walkthrough
3. BACKEND_QUICKSTART.md — Quick reference

Good luck! 🚀
