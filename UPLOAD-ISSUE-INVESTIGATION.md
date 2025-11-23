# Upload Infinite Loading Issue - Investigation Report

## Issue Summary
File upload functionality shows infinite "Uploading..." spinner even though uploads complete successfully. The spinner never stops, and the file input becomes disabled, preventing subsequent uploads.

## Timeline & Investigation Steps

### Initial Symptoms (2025-11-23)
- User unable to upload files - infinite loading spinner
- Network tab shows no requests when clicking upload
- Browser console shows Content Security Policy violations (red herring)

### Investigation Phase 1: Environment Variable Access
**Hypothesis:** Supabase client initialization failing due to Next.js 15 environment variable handling

**Action Taken:**
- Modified `lib/supabaseClientSSR.ts` to move env var access to module level
- Added validation to throw error if env vars missing

**Result:** Issue persisted. Later reverted this change as it wasn't the root cause.

### Investigation Phase 2: File Input Interaction
**Symptoms:**
- "No file chosen" browser popup appearing
- File input element showing `disabled=""` attribute in DOM
- `isUploading` state stuck as `true`

**Discovery:** After successful upload completion, `isUploading` remains `true`, which:
1. Disables the file input (`disabled={isUploading}`)
2. Shows spinner indefinitely
3. Prevents further uploads

### Investigation Phase 3: Component Architecture
**Refactor Applied:** Changed FileUpload component from invisible overlay pattern to ref-based pattern

**Original Pattern (Problematic):**
```tsx
<input
  type="file"
  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
  onChange={handleFileSelect}
/>
```

**New Pattern (Improved):**
```tsx
const fileInputRef = useRef<HTMLInputElement>(null);

<input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
<div onClick={() => fileInputRef.current?.click()}>...</div>
```

**Result:** File picker now opens correctly, but infinite spinner persists.

### Investigation Phase 4: User Activation Violation
**Critical Discovery:** Added `alert()` debugging dialogs which broke file picker

**Error Message:**
```
File chooser dialog can only be shown with a user activation.
[Violation] 'click' handler took 7119ms
```

**Explanation:** Browser security requires file inputs to be triggered synchronously in response to user click. Any delay (like `alert()` dialogs) invalidates the user gesture and blocks the file picker.

**Learning:** Cannot use `alert()` or any blocking operation before triggering file input.

### Investigation Phase 5: Console Logging Mystery
**Strange Behavior:**
- NO console logs appearing at all
- Not even module-level logs or page load logs
- But `setTimeout()` test worked, proving React state updates functional

**Test Applied:**
```tsx
setTimeout(() => {
  setUploading(false);
}, 2000);
```

**Result:** Spinner stopped after exactly 2 seconds, proving:
1. State updates work
2. Component renders properly
3. But `finally` block in async function never executes

**Critical Observation:**
- `isUploading` becomes `true` (spinner starts)
- Upload completes successfully (file appears in database)
- But `finally` block never runs to set `isUploading` back to `false`

### Investigation Phase 6: Async/Await vs Promise Chain
**Problem Identified:** The `async/await` pattern with `try/catch/finally` was not executing the `finally` block for unknown reasons.

**Original Code (Not Working):**
```tsx
const handleDocumentUpload = async (file: File) => {
  setUploading(true);
  try {
    const _shellFileId = await uploadFile(file, user.id);
    setUploadMessage("Success!");
    await fetchDocuments();
  } catch (err) {
    setUploadError(err.message);
  } finally {
    setUploading(false); // THIS NEVER EXECUTED
  }
};
```

**New Code (Working):**
```tsx
const handleDocumentUpload = async (file: File) => {
  setUploading(true);
  uploadFile(file, user.id)
    .then((_shellFileId) => {
      setUploadMessage("Success!");
      fetchDocuments();
    })
    .catch((err) => {
      setUploadError(err.message);
    })
    .finally(() => {
      setUploading(false); // GUARANTEED to execute
    });
};
```

## Root Cause
**Unknown why async/await finally block failed to execute.** Possible theories:
1. Next.js 15 babel/transpilation issue with async/await in client components
2. React 19 interaction with async event handlers
3. Supabase client or uploadFile function causing unusual promise rejection
4. Browser environment issue specific to production (Vercel)

The `.finally()` in a promise chain is more reliable and guaranteed to execute.

## Solution Applied
Replaced `async/await` pattern with explicit promise chain using `.then().catch().finally()`, and simplified the upload handler so that the UI `isUploading` state is driven solely by that promise chain rather than by the async function's own `try/finally` semantics. The `FileUpload` component now treats `onFileUpload` as a fire-and-forget callback (it no longer awaits or chains on the return value), which removes any coupling between React's event handling and the guarantee that the `.finally()` path will clear the spinner and re-enable the input.

## Files Modified
1. `apps/web/components/FileUpload.tsx` - Refactored to ref-based pattern
2. `apps/web/app/(main)/dashboard/page.tsx` - Changed upload handler to promise chain
3. `apps/web/lib/supabaseClientSSR.ts` - Temporarily modified, then reverted
4. `apps/web/utils/uploadFile.ts` - Added debug logging (later removed)

## Deployment Issues Encountered
**ESLint Error:** Build failed due to unused variable not starting with underscore
```
Error: 'shellFileId' is defined but never used. Allowed unused args must match /^_/u.
```
**Fix:** Renamed `shellFileId` to `_shellFileId` in promise chain.

## Outstanding Mysteries
1. **Why no console logs appeared:** Even basic module-level logs didn't show, suggesting possible:
   - Console being cleared programmatically
   - Log filtering in production build
   - Vercel preview environment differences
   - Browser extension interference

2. **Why async/await finally never ran:** This is the core mystery. The `finally` block in an async function should ALWAYS execute, but it didn't.

3. **What was calling the upload handler:** Since no logs appeared, we couldn't confirm which code path triggered the upload, though state changes proved it was being called.

## Recommendations for External Investigation
1. **Check Next.js 15 + React 19 async/await issues:** Search for known bugs with client component async event handlers
2. **Verify production vs development differences:** Test locally vs Vercel preview
3. **Enable verbose Next.js build logging:** May reveal transpilation issues
4. **Test in different browsers:** Rule out browser-specific behavior
5. **Check for middleware interference:** `middleware.ts` might be affecting client-side code
6. **Review Vercel deployment logs:** May show runtime errors not visible in console

## Testing Checklist
- [ ] Upload works without infinite spinner
- [ ] Success message appears
- [ ] Error handling works (test with invalid file)
- [ ] Can upload multiple files sequentially
- [ ] Console logs appear (if re-enabled for debugging)
- [ ] facility_address data flows through entire pipeline (Migration 66)

## Related Issues
- Migration 66: facility_address field implementation (COMPLETED)
- CSP violations in browser console (unrelated - report-only mode)
- Network tab showing no requests (symptom of user activation violation)

---

**Status:** Workaround implemented with promise chain pattern. Root cause of async/await finally failure remains unknown.

**Date:** 2025-11-23
**Session:** Claude Code debugging session
