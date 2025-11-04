# Smoke Test Guide - Block Workout System

## Quick Verification Checklist

After deployment, verify these core workflows work correctly:

### ✅ 1. Admin UI Smoke Test (Recommended - Easiest)

**Prerequisites:**
- Navigate to `/admin` in your browser
- Must be logged in as an admin user (check `users.is_admin = true`)

**Test Steps:**

1. **Create Workout**
   - Click "Create Workout" tab
   - Set workout name: "Test Superset Workout"
   - Add description: "Smoke test verification"
   - Click "Add Block"
   - Select pattern: "Superset"
   - Select work type: "Reps"
   - Set params: 3 sets, 180s work, 90s round rest
   - Add 2 exercises (use exercise picker)
   - Click "Add to Workout"
   - Click "Save Workout"
   - ✅ **Expected:** Success toast, workout ID returned

2. **Preview Timeline**
   - Click "Preview Timeline" button
   - ✅ **Expected:** See canonical timeline with:
     - Rep-round format showing exercises array
     - Canonical 5.6s transitions (beep → voice → countdown → GO)
     - Correct rest periods (90s = 5.6s transition + 84.4s extra)
     - Coach cue timings in green

3. **Publish Workflow**
   - Navigate to "Manage Workouts" tab
   - Find your test workout
   - Click "Publish" (if unpublished)
   - ✅ **Expected:** Status changes to "published", version increments

4. **Duplicate Workout**
   - Click "Duplicate" on your test workout
   - ✅ **Expected:** New workout created with "(Copy)" suffix

5. **Edit & Update**
   - Click "Edit" on a workout
   - Modify workout name
   - Click "Save Workout"
   - ✅ **Expected:** Changes saved, version incremented

6. **Delete Workflow**
   - Click "Delete" on a test workout
   - Confirm deletion
   - ✅ **Expected:** Workout removed from list

---

### ✅ 2. API Smoke Test (Advanced - Requires Auth)

**Prerequisites:**
- Admin user authenticated (requires session cookie)
- Port 5000 running (or your deployment port)

**Method 1: Using Browser DevTools (Easiest API Test)**

1. Open browser DevTools (F12) → Network tab
2. Navigate to `/admin` (establishes authenticated session)
3. Copy your session cookie from Network request headers
4. Use curl with cookie header (see examples below)

**Method 2: Direct API Testing**

```bash
# Step 1: Create workout from JSON example
curl -X POST http://localhost:5000/api/admin/block-workouts \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=<YOUR_SESSION_COOKIE>" \
  --data-binary @examples/superset_reps.json

# Expected Response:
# { "id": 123 }

# Step 2: Publish the workout
curl -X POST http://localhost:5000/api/admin/block-workouts/123/publish \
  -H "Cookie: connect.sid=<YOUR_SESSION_COOKIE>"

# Expected Response:
# { "ok": true, "version": 2 }

# Step 3: Fetch published workouts (public endpoint - no auth)
curl http://localhost:5000/api/block-workouts

# Expected Response:
# [{ "id": 123, "name": "Chest & Back Superset (Reps)", ... }]
```

**Example Workouts Provided:**
- `examples/superset_reps.json` - Rep-based superset (3 rounds, 180s work)
- `examples/superset_time.json` - Time-based superset (4 rounds, 45s work)
- `examples/straight_sets.json` - Straight sets (5 sets with 2min rest)

---

### ✅ 3. Timeline Compilation Verification

**Test Canonical v2 Timeline Compiler:**

```bash
# Compile a workout timeline
curl -X POST http://localhost:5000/api/block-workouts/123/compile \
  -H "Content-Type: application/json" \
  -d '{"startAtMs": 0}'

# Expected Response Structure:
# {
#   "workoutHeader": { "name": "...", "totalDurationSec": 540, ... },
#   "timeline": [
#     { "step": 1, "type": "work", "exercises": [...], "round": 1, "atMs": 0, "endMs": 180000 },
#     { "step": 2, "type": "countdown", "atMs": 180000, "endMs": 183000 },
#     { "step": 3, "type": "round_rest", "atMs": 180700, "endMs": 185600 },
#     { "step": 4, "type": "work", "exercises": [...], "round": 2, "atMs": 185600, ... }
#   ]
# }
```

**Verify:**
- ✅ Rep-round work steps have `exercises` array (not single `exercise`)
- ✅ Canonical transitions present: `countdown` → `round_rest` → next work step
- ✅ Transition timing: 5.6s total (beep at T0, voice at T0+700ms, GO at T0+5s)
- ✅ Extra rest applied correctly: `roundRestSec > 5.6` adds `restSec - 5.6` buffer

---

### ✅ 4. Workout Session Flow (End-to-End)

**User Workflow Test:**

1. **Start Session**
   ```bash
   curl -X POST http://localhost:5000/api/block-workouts/123/start-session \
     -H "Cookie: connect.sid=<YOUR_SESSION_COOKIE>"
   ```
   ✅ **Expected:** Session ID returned

2. **Navigate to Workout Player**
   - Go to `/workout-session?sessionId=<SESSION_ID>`
   - ✅ **Expected:** Timeline loads, exercises display correctly

3. **Verify Audio System**
   - Click "Start Workout"
   - ✅ **Expected:** 
     - Countdown beeps play (earbud-optimized)
     - Voice prompts play (Browser TTS by default)
     - Beeps duck voice audio (smooth gain transitions)

4. **Test Coach Events**
   - Monitor browser console for canonical events:
     - `EV_WORK_START`, `EV_WORK_END`
     - `EV_REST_START`, `EV_REST_END`
     - `EV_ROUND_START`, `EV_ROUND_END`
   - ✅ **Expected:** Events fire at correct timestamps

---

## Common Issues & Solutions

### Issue: "Unauthorized" when calling admin endpoints
**Solution:** Ensure user has `is_admin = true` in database:
```sql
UPDATE users SET is_admin = true WHERE email = 'your-email@example.com';
```

### Issue: "Invalid workout data" validation error
**Solution:** Check JSON matches required schema:
- `pattern` field required ("superset" | "straight_sets" | "circuit" | "custom")
- `mode` field required ("time" | "reps")
- `exercises` must be array of `{ exerciseId: number }` objects

### Issue: Timeline shows gaps or overlapping timestamps
**Solution:** Verify compiler v2 is active:
- Check `server/timeline-compiler.ts` has canonical 5.6s transition logic
- Extra rest should be: `roundRestSec - 5.6` when `roundRestSec > 5.6`

### Issue: Rep-round workouts show individual exercise steps instead of combined
**Solution:** Verify timeline has `exercises` array in work steps:
```typescript
{ type: "work", exercises: [{id: 123}, {id: 456}], round: 1 }
```

---

## Production Deployment Checklist

Before going live, verify:

- [ ] `npm i zod eventemitter3` installed
- [ ] `npm run db:push` applied (syncs Drizzle schema)
- [ ] At least one admin user seeded (`is_admin = true`)
- [ ] `OPENAI_API_KEY` environment variable set (for Realtime API voice)
- [ ] Port 5000 accessible (or configure your production port)
- [ ] Path aliases working (`@/` imports resolve correctly)
- [ ] All smoke tests pass (create → publish → session flow)

---

## Exercise ID Reference

Test workouts use placeholder exercise IDs. Replace with actual IDs from your Airtable:

```bash
# Fetch available exercises
curl http://localhost:5000/api/exercises

# Use real IDs from response in your workout JSON
```

---

## Audit Trail

All admin actions are logged to `admin_audit_log` table:
- Workout creation, updates, deletions
- Publish/unpublish actions
- User ID and timestamp recorded

Query audit log:
```sql
SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT 10;
```

---

## Support

If smoke tests fail:
1. Check workflow logs: `/tmp/logs/Start_application_*.log`
2. Check browser console for client errors
3. Verify database schema matches `shared/schema.ts`
4. Confirm Zod validation passes (check error messages)

**Key Files:**
- Timeline compiler: `server/timeline-compiler.ts`
- Admin routes: `server/routes.ts` (line 165+)
- Workout DTO: `shared/dto.ts`
- Block params schema: `shared/timeline.ts`
