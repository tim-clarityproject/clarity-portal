# Supabase Auth Cleanup - Orphaned Records

## Issue
User `tadutton1@gmail.com` exists in Supabase Auth (auth.users table) but was deleted from public profile tables. This makes the email unusable for new signups and causes silent failures.

## How to Clean Up

### Manual Cleanup (One-Time)

1. **Go to Supabase Dashboard**
   - URL: https://app.supabase.com
   - Select your project: "clarity-portal"

2. **Find the orphaned user**
   - Click on "Auth" in left sidebar
   - Click on "Users" 
   - Search for: `tadutton1@gmail.com`
   - If found, click on the user record

3. **Delete the user**
   - Click the three-dot menu (⋯) at top right
   - Select "Delete user"
   - Confirm deletion
   - User should disappear from the list

4. **Verify deletion**
   - The email `tadutton1@gmail.com` should now be available for fresh signup

## Prevent Future Orphaned Records

The account deletion flow has been updated to:
1. Delete from all public tables (missions, decisions, reflections, profiles)
2. Call `delete-user` Edge Function to remove from auth.users
3. Logout the user

**New deletion flow is now in place.** Any future account deletions will clean up both Auth and public tables automatically.

## Edge Function: delete-user

**Location:** `supabase/functions/delete-user/index.ts`

**What it does:**
- Requires valid auth token (user must be logged in)
- Deletes the user from Supabase Auth (auth.users table)
- Server-side operation (can't be done from client with anon key)

**How it's called:**
- MyAccount.jsx → handleDeleteAccount() calls this function after deleting public data
- Uses the user's access token for authentication

## Error Handling

**Signup/Login now shows clear errors:**
- "An account with this email already exists. Try logging in instead." (email exists in Auth)
- "Invalid email or password. Please try again." (wrong credentials)
- "Email not confirmed. Check your email for verification link." (email not verified)
- Specific error messages for each failure case

## Testing Checklist

- [ ] Clean up orphaned `tadutton1@gmail.com` from Supabase Auth manually
- [ ] Try signing up with `tadutton1@gmail.com` again → should succeed
- [ ] Test account deletion with a new test account → should remove from Auth
- [ ] Try signing up with deleted email → should succeed as fresh signup
- [ ] Test signup with already-registered email → should show clear error
- [ ] Test login with wrong password → should show clear error

## Status

**Fixed in this session:**
- ✅ Account deletion flow updated to delete from both Auth and public tables
- ✅ Edge Function created for server-side auth.users deletion
- ✅ Error handling updated for signup/login with user-facing messages
- ⏳ Manual cleanup needed for orphaned tadutton1@gmail.com record
- ⏳ Testing needed to confirm flows work end-to-end
