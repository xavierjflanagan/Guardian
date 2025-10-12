# Render.com Build Configuration

This document specifies the exact build configuration required for the Exora Health worker service on Render.com.

## Service: Exora Health (Worker)

### Environment Settings

**Node Version:** `20.x`
- Go to Service Settings > Environment > Node Version
- Select "20.x" from the dropdown

**Enable Corepack:** Yes
- This allows PNPM to be used instead of NPM

### Build Configuration

**Root Directory:** `apps/render-worker`

**Build Command:**
```bash
cd ../.. && corepack enable && corepack prepare pnpm@9.15.1 --activate && pnpm install --frozen-lockfile && pnpm --filter exora-v3-worker run build
```

**Explanation:**
1. `cd ../..` - Navigate to monorepo root
2. `corepack enable` - Enable Corepack for PNPM support
3. `corepack prepare pnpm@9.15.1 --activate` - Use exact PNPM version
4. `pnpm install --frozen-lockfile` - Install all dependencies (respects lockfile strictly)
5. `pnpm --filter exora-v3-worker run build` - Build only the worker package

**Start Command:**
```bash
pnpm run start
```

### Why This Works

1. **Monorepo-aware:** Installs from root so all workspace dependencies are available
2. **Frozen lockfile:** Fails fast if lockfile is out of sync (prevents runtime issues)
3. **Version pinned:** Uses exact PNPM version (9.15.1) specified in package.json
4. **No NPM conflicts:** Removed `npm install` from package.json build script
5. **TypeScript devDependencies:** Available because we install from root with `--frozen-lockfile`

### Troubleshooting

**Build fails with "Cannot find module 'typescript'":**
- Ensure the build command runs from monorepo root (`cd ../..`)
- Ensure `pnpm install --frozen-lockfile` runs before the build

**Build fails with "frozen-lockfile" error:**
- Lockfile is out of sync with package.json
- Run `pnpm install` locally and commit the updated lockfile
- The pre-commit hook should prevent this automatically

**Build uses wrong Node version:**
- Check Service Settings > Environment > Node Version is set to "20.x"
- The `.nvmrc` file in the repo root specifies Node 20

### Manual Configuration Steps

If you need to reconfigure the service manually:

1. Go to Render Dashboard → Exora Health service
2. Settings → Environment → Node Version → Select "20.x"
3. Settings → Build & Deploy → Build Command → Paste the build command above
4. Settings → Build & Deploy → Start Command → `pnpm run start`
5. Save Changes

The service will redeploy automatically with the new configuration.
