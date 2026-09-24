# Domain Configuration - Clarity Portal

**Primary Domain:** `portal.theclarityproject.co.uk`  
**Secondary Domain (Auto-Redirect):** `clarity-portal-app.vercel.app` → redirects to primary

---

## Configuration Checklist

### ✅ Vercel Configuration
- [x] `vercel.json` - Added 301 redirect rule
- [x] Redirect rule: `clarity-portal-app.vercel.app/*` → `portal.theclarityproject.co.uk/*`
- [x] Permanent redirect (301) - preserves path
- [ ] **MANUAL:** Set `portal.theclarityproject.co.uk` as primary domain in Vercel dashboard
  - Go to: https://vercel.com/dashboard → Project Settings → Domains
  - Verify primary domain is set to `portal.theclarityproject.co.uk`
  - Verify secondary domain `clarity-portal-app.vercel.app` is marked as redirect target

### ⚠️ Supabase Auth Configuration (CRITICAL)
**Must verify these settings in Supabase Dashboard:**

1. **Site URL** (Project Settings → Auth → URL Configuration)
   - Current: `portal.theclarityproject.co.uk` (should be custom domain, NOT .vercel.app)
   - [ ] Verify this is set to `https://portal.theclarityproject.co.uk`

2. **Redirect URLs** (Project Settings → Auth → URL Configuration → Additional Redirect URLs)
   - These URLs are used after login, signup, email verification
   - [ ] Add if missing: `https://portal.theclarityproject.co.uk/auth/callback`
   - [ ] Add if missing: `https://portal.theclarityproject.co.uk/`
   - [ ] Remove if present: Any `clarity-portal-app.vercel.app` redirect URLs

3. **Email Templates** (Auth → Email Templates)
   - Check confirmation email template for hardcoded links
   - [ ] Should contain `portal.theclarityproject.co.uk`, not `.vercel.app` domain
   - If hardcoded, update the template to use `[CONFIRM_EMAIL_URL]` variable instead

### ✅ Codebase Configuration
- [x] No hardcoded `.vercel.app` references in code
- [x] All auth redirects use relative paths (framework-handled)
- [x] Environment variables don't hardcode domain

### Testing Checklist
After deploying changes:

- [ ] Visit `clarity-portal-app.vercel.app` → should 301 redirect to `portal.theclarityproject.co.uk`
- [ ] Check address bar — should always show `portal.theclarityproject.co.uk`
- [ ] Test on mobile specifically
- [ ] Test login flow — confirm redirect after auth points to custom domain
- [ ] Test email verification link — confirm it redirects to custom domain
- [ ] Test signup flow — confirm all redirects use custom domain
- [ ] Test password reset link — confirm it uses custom domain

---

## Why This Matters

1. **User Confusion:** Users might bookmark or share `.vercel.app` URL, leading to inconsistent access
2. **Session Cookies:** Auth sessions are tied to domain — inconsistent domains can cause login issues
3. **Email Links:** Auth emails (verification, password reset) must point to same domain user expects
4. **SEO:** Canonical domain should be consistent to avoid duplicate content penalties
5. **Security:** Email verification links from one domain won't work on another

---

## Deployment Status

**vercel.json:** ✅ Updated with redirect rules  
**Supabase Auth:** ⚠️ **Needs manual verification in Supabase dashboard**

---

## Next Steps

1. **Deploy this commit to Vercel** (auto-deploy on git push)
2. **Manually verify Supabase settings** (see checklist above)
3. **Test on mobile and desktop** to confirm:
   - clarity-portal-app.vercel.app redirects to portal.theclarityproject.co.uk
   - Auth flows (login, signup, email verification) all use custom domain
   - Address bar always shows portal.theclarityproject.co.uk

---

## Quick Reference: Supabase URL Settings

**Location:** https://app.supabase.com → Select Project → Settings → Auth → URL Configuration

**Key Fields to Verify:**
```
Site URL: https://portal.theclarityproject.co.uk

Additional Redirect URLs:
  - https://portal.theclarityproject.co.uk/auth/callback
  - https://portal.theclarityproject.co.uk/
  (Remove any .vercel.app URLs)
```

If these are set to `.vercel.app`, auth flows will redirect users to the wrong domain!
