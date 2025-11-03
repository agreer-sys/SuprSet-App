# Replit Implementation Backup - Nov 3, 2025

## What's Backed Up

This folder contains the Replit-modified implementations before migrating to ChatGPT's canonical architecture.

### Files Backed Up:

1. **server/timeline-compiler.ts** (27KB)
   - Replit's implementation with per-exercise work steps for rep-based rounds
   - Proportional duration splitting using heuristics (40s base, 1.5x unilateral)
   - Working but tightly coupled to existing patterns

2. **client/src/coach/observer.ts** (3.2KB)
   - Current event observer implementation
   
3. **client/src/coach/responseService.ts** (6.6KB)
   - Database-backed coach response system
   - Cooldown tracking, chatter filtering
   
4. **client/src/audio/voiceBus.ts** (3.2KB)
   - Voice ducking and audio coordination
   
5. **client/src/pages/workout-session.tsx** (82KB)
   - Main workout session page with all integrations

## Why This Backup?

Migration to ChatGPT's cleaner, event-driven architecture:
- More modular, maintainable
- Better separation of concerns
- Aligned with Lab test harness
- Easier to extend for future features

## Recovery

If needed, these files can be restored:
```bash
cp backup_replit_implementation_2025-11-03/timeline-compiler.ts server/
cp backup_replit_implementation_2025-11-03/observer.ts client/src/coach/
cp backup_replit_implementation_2025-11-03/responseService.ts client/src/coach/
cp backup_replit_implementation_2025-11-03/voiceBus.ts client/src/audio/
cp backup_replit_implementation_2025-11-03/workout-session.tsx client/src/pages/
```
