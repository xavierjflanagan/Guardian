3rd Nov 2025

# Supabase Dashboard Configuration for Magic Link Authentication

## CRITICAL: Complete these steps to fix magic link authentication

Your magic links are currently redirecting to the site root instead of `/auth/callback`, which causes authentication to fail. Follow these steps to fix the configuration.

---

## Step 1: Access Supabase Dashboard

1. Go to https://supabase.com/dashboard
2. Select your project: **napoydbbuvbpyciwjdci** (or the project name you're using)
3. Navigate to: **Authentication** → **URL Configuration** (left sidebar)

---

## Step 2: Configure Site URL

**Field:** Site URL

**Set to:**
```
https://exorahealth.com.au
```

**Why:** This is your production domain and should be the base URL for all auth redirects.

---

## Step 3: Configure Redirect URLs

**Field:** Redirect URLs

**Add the following URLs** (click "Add URL" for each):

```
https://exorahealth.com.au/auth/callback
https://exorahealth.com.au/**
http://localhost:3000/auth/callback
http://localhost:3000/**
```

**Why:**
- `/auth/callback` is where magic links should land after verification
- `/**` allows any path under your domain (for flexibility)
- `localhost` entries enable local development testing

---

## Step 4: Check Email Template Settings

1. In Supabase Dashboard, navigate to: **Authentication** → **Email Templates**
2. Click on **Magic Link** template
3. **IMPORTANT:** Verify the confirmation link format in the template

**The link should look like:**
```html
<a href="{{ .ConfirmationURL }}">Confirm your email</a>
```

**DO NOT override with a hardcoded URL like:**
```html
<!-- WRONG - Do not use this -->
<a href="https://exorahealth.com.au">Confirm your email</a>
```

**Why:** The `{{ .ConfirmationURL }}` variable includes the `redirect_to` parameter sent by your app. Hardcoding the URL strips this parameter.

---

## Step 5: Verify Environment Variables (Vercel)

Go to your Vercel project dashboard and verify these environment variables are set:

**Required Variables:**
```
NEXT_PUBLIC_SUPABASE_URL=https://napoydbbuvbpyciwjdci.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your anon key]
SITE_PASSWORD=[your beta access code]
MAINTENANCE_MODE=false
```

**Where to check:**
1. Go to https://vercel.com/dashboard
2. Select your project (exorahealth.com.au)
3. Go to **Settings** → **Environment Variables**
4. Verify all values are correct

---

## Step 6: Test the Configuration

### Local Testing

1. Start your dev server:
   ```bash
   pnpm --filter @guardian/web run dev
   ```

2. Navigate to `http://localhost:3000/sign-in`

3. Enter your email and click "Send Magic Link"

4. Check your email inbox

5. **Before clicking the link, inspect it:**
   - Right-click the "Confirm your email" button → Copy link address
   - Paste into a text editor
   - **Verify it includes:** `redirect_to=http://localhost:3000/auth/callback`

6. Click the magic link

7. **Check browser console (F12 → Console tab)** for debug logs:
   ```
   [Auth Callback] URL: http://localhost:3000/auth/callback?token=...
   [Auth Callback] Query params: ?token=...
   [Auth Callback] Hash fragment: #access_token=...
   [Auth Callback] Initial session check: { hasSession: true, error: null }
   ```

8. You should be redirected to `/dashboard` (or password gate if first time)

### Production Testing

1. Push your changes to GitHub:
   ```bash
   git add .
   git commit -m "fix: Remove middleware auth interception and add defensive token exchange"
   git push
   ```

2. Wait for Vercel deployment to complete

3. Navigate to `https://exorahealth.com.au/sign-in`

4. Test the full sign-in flow

5. **Check browser console for debug logs**

6. Verify you reach the dashboard successfully

---

## Expected Magic Link Format (After Fix)

**CORRECT format:**
```
https://napoydbbuvbpyciwjdci.supabase.co/auth/v1/verify?token=pkce_xxx...&type=magiclink&redirect_to=https://exorahealth.com.au/auth/callback
```

**Key elements:**
- `token=pkce_xxx...` - The verification token
- `type=magiclink` - Identifies this as a magic link flow
- `redirect_to=https://exorahealth.com.au/auth/callback` - **MUST include /auth/callback path**

**INCORRECT format (current problem):**
```
https://napoydbbuvbpyciwjdci.supabase.co/auth/v1/verify?token=pkce_xxx...&type=magiclink&redirect_to=https://exorahealth.com.au
```

Notice the missing `/auth/callback` path.

---

## Troubleshooting

### Problem: Still redirecting to site root

**Solution:** Double-check Step 4 (Email Template). The template might be overriding the `redirect_to` parameter.

### Problem: "Auth session missing!" error persists

**Check:**
1. Browser console logs (F12 → Console)
2. Look for `[Auth Callback]` debug messages
3. Verify `redirect_to` parameter in magic link includes `/auth/callback`
4. Check that middleware changes are deployed (no auth param interception)

### Problem: Password gate appears after sign-in

**This is expected behavior for private beta:**
1. User signs in with magic link (Supabase auth)
2. If first visit, redirected to password gate (site access control)
3. Enter site password (SITE_PASSWORD env var)
4. Cookie is set, can access dashboard

**This is two-layer security:**
- Layer 1: Supabase authentication (who you are)
- Layer 2: Site password (beta access control)

---

## Rollback Plan

If authentication breaks after changes:

1. **Revert code changes:**
   ```bash
   git revert HEAD
   git push
   ```

2. **Keep Supabase dashboard settings** - they don't break anything

3. **The fix will still work once Supabase dashboard is configured correctly**

---

## Summary Checklist

- [ ] Set Site URL to `https://exorahealth.com.au`
- [ ] Add all 4 redirect URLs (prod + localhost)
- [ ] Verify email template uses `{{ .ConfirmationURL }}`
- [ ] Verify Vercel environment variables
- [ ] Test locally first
- [ ] Deploy to production
- [ ] Test production sign-in flow
- [ ] Verify dashboard access works

---

**After completing these steps, magic link authentication should work correctly.**
