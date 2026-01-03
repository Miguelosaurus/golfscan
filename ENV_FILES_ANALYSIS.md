# Environment Files Usage Analysis

## Summary

Your project uses **two different systems** for loading environment variables:

1. **Backend (Node.js)**: Uses `dotenv` package - only loads `.env`
2. **Frontend (Expo)**: Uses Expo's built-in env loader - loads both `.env` AND `.env.local`

---

## Backend Environment Loading

**Location**: `backend/trpc/hono.ts`
```typescript
import 'dotenv/config'; // MUST be first so other modules can read env vars
```

**What it loads**: Only `.env` from project root
- `dotenv/config` by default only loads `.env`
- Does NOT automatically load `.env.local`

**Variables used by backend**:
- `GOOGLE_API_KEY` - `backend/trpc/routes/scorecard.router.ts`
- `GOLF_COURSE_API_KEY` or `EXPO_PUBLIC_GOLF_COURSE_API_KEY` - `backend/trpc/routes/golfCourse.router.ts`
- `GOOGLE_PLACES_API_KEY` or `GOOGLE_API_KEY` - `backend/services/googlePlaces.ts`
- `PORT` (defaults to 3001) - `backend/trpc/hono.ts`
- `HOST` (defaults to '0.0.0.0') - `backend/trpc/hono.ts`
- `OPENAI_API_KEY` - `backend/test/scorecard-accuracy/runner.ts`

---

## Frontend Environment Loading

**Location**: Expo automatically loads env files during build/start

**What it loads**: Both `.env` AND `.env.local` (`.env.local` takes precedence)
- Expo's Metro bundler automatically loads both files
- Only variables prefixed with `EXPO_PUBLIC_` are exposed to the client bundle
- `.env.local` values override `.env` values

**Variables used by frontend**:
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` - `app/_layout.tsx`, `lib/auth.ts`
- `EXPO_PUBLIC_CONVEX_URL` - `app/_layout.tsx`, `lib/convex.ts`
- `EXPO_PUBLIC_API_BASE_URL` - `lib/trpc.ts`
- `EXPO_PUBLIC_GOLF_COURSE_API_KEY` - `lib/golf-course-api.ts`

---

## The Problem

If `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is only in `.env.local`:
- ✅ **Frontend will see it** (Expo loads both files)
- ❌ **Backend won't see it** (but backend doesn't need it anyway)

However, if you restart Expo without clearing cache, it might not pick up new env vars.

---

## Recommendations

1. **For Frontend (Expo) variables** (`EXPO_PUBLIC_*`):
   - Put them in `.env.local` (gitignored, local overrides)
   - Or put them in `.env` (if you want to commit defaults)
   - **Restart Expo with cache clear**: `expo start -c` after adding new vars

2. **For Backend (Node.js) variables**:
   - Put them in `.env` (backend only loads `.env`)
   - Or modify `backend/trpc/hono.ts` to also load `.env.local`:
     ```typescript
     import dotenv from 'dotenv';
     dotenv.config(); // Load .env
     dotenv.config({ path: '.env.local' }); // Also load .env.local
     ```

3. **Best Practice**:
   - `.env` - Default values (can be committed)
   - `.env.local` - Local overrides (gitignored, takes precedence)

---

## Files That Read Environment Variables

### Frontend (Expo)
- `app/_layout.tsx` - `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_CONVEX_URL`
- `lib/auth.ts` - `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `lib/convex.ts` - `EXPO_PUBLIC_CONVEX_URL`
- `lib/trpc.ts` - `EXPO_PUBLIC_API_BASE_URL`
- `lib/golf-course-api.ts` - `EXPO_PUBLIC_GOLF_COURSE_API_KEY`

### Backend (Node.js)
- `backend/trpc/hono.ts` - `PORT`, `HOST`, `EXPO_PUBLIC_GOLF_COURSE_API_KEY` (debug)
- `backend/trpc/routes/scorecard.router.ts` - `GOOGLE_API_KEY`
- `backend/trpc/routes/golfCourse.router.ts` - `GOLF_COURSE_API_KEY` or `EXPO_PUBLIC_GOLF_COURSE_API_KEY`
- `backend/services/googlePlaces.ts` - `GOOGLE_PLACES_API_KEY` or `GOOGLE_API_KEY`
- `backend/test/scorecard-accuracy/runner.ts` - `OPENAI_API_KEY`

### Convex (Serverless)
- `convex/courseImages.ts` - `GOOGLE_PLACES_API_KEY` or `GOOGLE_API_KEY` (via `ctx.env.get()`)
- `convex/golfCourse.ts` - `GOLF_COURSE_API_KEY` or `EXPO_PUBLIC_GOLF_COURSE_API_KEY` (via `ctx.env.get()`)

---

## Solution for Your Current Issue

Since `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is undefined:

1. **Check which file has it**: Look in both `.env` and `.env.local`
2. **If it's in `.env.local`**: Make sure Expo is loading it (restart with `expo start -c`)
3. **If it's missing**: Add it to `.env.local`:
   ```
   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_cG9zc2libGUtamF3ZmlzaC02MS5jbGVyay5hY2NvdW50cy5kZXYk
   ```
4. **Restart Expo**: `expo start -c` to clear cache and reload env vars


