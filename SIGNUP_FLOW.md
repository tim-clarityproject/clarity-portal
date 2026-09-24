# Signup Flow - Atomic Transaction with Rollback

## Signup Process Steps

**Exact sequence in AuthContext.jsx:**

1. **Create Auth user** → `auth.signUp(email, password)`
   - Creates record in Supabase Auth (auth.users table)
   - Email gets verification token sent (if email verification enabled)

2. **Sign in** → `auth.signIn(email, password)`
   - Authenticates newly created user
   - Returns access token and session

3. **Get session** → `sessionManager.getSession()`
   - Retrieves session info including user.id
   - Validates session is valid

4. **Create profile** → `supabase.from('profiles').upsert({...})`
   - Creates user profile record in public profiles table
   - Stores: id, first_name, last_name, email, terms_accepted

5. **Save session metadata** → `sessionManager.saveSessionMetadata(session)`
   - Stores session info locally
   - Tracks session expiry

6. **Load user data** → `dataSyncManager.loadUserData(user.id)`
   - Loads user's missions, decisions, and other data
   - Caches in sessionStorage

## Failure Scenarios & Rollback

### Problem: Non-atomic signup
If ANY step after #1 fails, the Auth user is already created in Supabase Auth. Without rollback:
- Auth user remains (orphaned)
- Profile may or may not exist
- Email becomes unusable (can't retry signup with same email)

### Solution: Automatic Rollback on Failure

**When signup fails:**
1. Check if Auth user was created (authUserCreated flag)
2. If yes, call `delete-user` Edge Function to remove from auth.users
3. Logout the user
4. Return error to UI

**Result:** Email is free to use immediately; user can retry signup

## Common Failure Points

### Rate Limiting (429 error)
- Supabase Auth has request rate limits
- Can occur if making too many auth requests in short time
- Signature: `status === 429`
- Error message: "Too many requests. Please wait a moment and try again."
- **Fix:** Rollback deletes Auth user; user can retry after rate limit window

### Profile Insert Failure
- Could fail if database constraint violated
- Or if row-level security (RLS) policy blocks insert
- Rollback ensures Auth user is cleaned up

### Session Issues
- If getSession() fails after auth.signUp, signup is incomplete
- Rollback cleans up Auth user

### Network Timeouts
- If any step times out
- Rollback ensures clean state

## Error Messages Shown to User

- "An account with this email already exists" → Account exists in Auth (shouldn't happen with rollback)
- "Invalid email or password" → Auth rejected the credentials
- "Too many requests. Please wait a moment and try again." → Rate limited
- Generic message → Other failures (rollback handles cleanup)

## Testing the Rollback

### Normal signup test
1. Signup with new email
2. Verify Auth user created
3. Verify profile created
4. Verify email sent (if email verification enabled)

### Simulate failure test (if needed)
1. Temporarily break profile insert (comment out upsert)
2. Attempt signup
3. Verify Auth user is deleted (rollback executed)
4. Logout
5. Retry signup with same email
6. Verify it succeeds

## Implementation Details

**Rollback uses the same delete-user Edge Function:**
- Location: `supabase/functions/delete-user/index.ts`
- Requires valid access token
- Deletes from auth.users table only

**Logging for debugging:**
- ✓ Step 1-6: Logged on success
- ⚠️ Rollback: Logged with warnings if it occurs
- Check browser console for signup flow details

## Status

**Fixed in this session:**
- ✅ Rollback logic implemented in signup flow
- ✅ Each step tracked with authUserCreated flag
- ✅ Rate limit error detection (429)
- ✅ Automatic cleanup on any failure after Auth user creation
- ⏳ Testing needed to confirm rollback works

## Next Steps

1. Delete orphaned `tim@theclarityproject.co.uk` from Supabase Auth (manual)
2. Wait for rate limit window to clear
3. Test fresh signup with that email
4. Confirm Auth user created AND profile created
5. Verify error messages display correctly
