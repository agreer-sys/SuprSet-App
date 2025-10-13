# SuprSet - Strength Training Superset Recommendation App

## Overview
SuprSet is a React-based web application providing intelligent exercise superset recommendations for strength training. It aims to build a community-driven AI system for real-time computer vision-based exercise analysis, enabling intelligent recommendations and user contributions for a proprietary dataset. Key capabilities include dual-mode recommendations (Trainer/Standard), real-time computer vision with pose and object detection, a community contribution system with quality controls, user authentication, and an AI training pipeline.

## User Preferences
- **Development Process**: Maintain master TODO.md list - add all discussed/suggested features to this central roadmap
- **Feedback Style**: Continue challenging assumptions and providing counterpoints on pairing logic and design decisions
- **Testing Requirements**: Always confirm all adjustments work properly on mobile browser before reporting completion - mobile-first validation mandatory
- **Strategic Vision**: Build community-driven AI model rather than relying on generic solutions - create competitive moat through proprietary datasets

## System Architecture
The application uses a client-server architecture with a React frontend and an Express.js backend.

**Frontend (React + TypeScript)**
- **Framework**: React with TypeScript, Vite.
- **UI**: Shadcn/ui with Tailwind CSS for a responsive, mobile-first interface.
- **Computer Vision**: Integrates MediaPipe BlazePose for human pose detection and COCO-SSD for object detection, with spatial mapping and Roboflow API integration.
- **Contribution System**: Supports image contributions with quality control and crowdsourced labeling.

**Backend (Express + Node.js)**
- **Server**: Express.js with TypeScript.
- **Data Source**: Airtable API for exercise data.
- **Storage**: PostgreSQL database for persistent data, user management, and AI training data.
- **Authentication**: Replit Auth with OpenID Connect.
- **AI Training Pipeline**: Supports image compression and a PostgreSQL schema for AI training optimization.
- **AI Workout Coach (Event-Driven Observer)**: Real-time OpenAI API for conversational voice interaction. The host controls timing, and the AI observes via canonical events. Server-side relay injects RAG knowledge base context. Includes a minimal-chatter prompt, a `record_set` tool, and a beep system for precise timing.
  - **Canonical Events**: `set_start`, `set_10s_remaining`, `set_complete`, `rest_start`, `rest_complete`, `await_ready`, `user_ready`, `workout_complete`.
- **Block-Based Workout Architecture**: Workouts are built from parameter-driven Blocks that compile into ExecutionTimelines with absolute timestamps. This allows for universal workout parameterization.
- **Drift-Free Timeline Execution**: Uses an absolute timestamp system with drift detection and resync validation. Includes robust pause/resume functionality.
- **Adaptive Ready System (`await_ready`)**: The timeline automatically pauses at strategic points (between blocks, after rep-based sets) for real-world flexibility, allowing users to signal readiness via voice or UI.
- **Voice Prompts System**: Automatic AI coach announcements at key workout moments, including step transitions, 10-second warnings, and rest periods.
- **Admin Authentication System**: `isAdmin` boolean field in the users table with dedicated middleware restricts access to `/api/admin/*` endpoints.

**Data Integration**
- **Airtable Service**: Handles API calls and data transformation for exercise data.
- **Muscle Group Consolidation**: Standardized 38 muscle groups into 10 primary categories.

**Recommendation System**
- **Standard Mode**: 0-100 scoring algorithm for exercise pairing.
- **Trainer Mode**: Binary pass/fail filtering based on strict criteria.
- **Pairing Logic**: Two-tier system combining curated exact pairings with exercise type antagonist pairing.
- **Block Format Conversion**: API endpoints (`/api/recommendations/preview-block`, `/api/recommendations/create-block`) convert superset recommendations to the Block format for the compiler pipeline, including Airtable exercise snapshots for coach context.

## External Dependencies
- **Airtable**: Primary database for exercise data.
- **MediaPipe BlazePose**: Human pose detection.
- **COCO-SSD**: Baseline gym equipment object detection.
- **Roboflow**: API for custom dataset training and management.
- **TensorFlow.js**: Machine learning models library.
- **PostgreSQL**: Database for user authentication, session management, and AI training data.
- **Replit Auth (OpenID Connect)**: User authentication and session management.
- **OpenAI Realtime API (GPT-3.5-turbo)**: Powers the AI Workout Coach.
- **LangChain**: Orchestrates AI coach conversations.

## Recent Fixes (Oct 10, 2025)
- **CRITICAL FIX: Duplicate Queue Processing** 
  - **Root cause**: Both `response.audio.done` and `response.done` were calling `processQueuedEvent()` with 100ms delays
  - **Impact**: Queue processed twice per response → duplicate AI responses/acknowledgments
  - **Fix**: Only process queue in `response.audio.done`, use `response.done` as safeguard only
  - **Result**: Single clean response per event instead of 2-3 duplicates
- **CRITICAL FIX: Timeline Loading Race Condition** (Session Instructions)
  - **Root cause #1**: `updateSessionContext` checked `hasTimelineNow` AFTER merging context, comparing merged object to itself (always true)
  - **Root cause #2**: Timeline arrives BEFORE OpenAI connects, so `openaiWs.readyState !== OPEN` prevents instruction update
  - **Impact**: AI's instructions were never updated with workout timeline, resulting in empty/silent responses
  - **Fix #1**: Check `contextHasTimeline` on incoming context BEFORE merging: `isMajorUpdate = contextHasTimeline && !hadTimeline`
  - **Fix #2**: When OpenAI connects, check if timeline already exists and include it in initial session config
  - **Result**: AI now properly receives workout timeline whether it arrives before or after OpenAI connection
- **New Voice Coach Flow** (Optimized for user who manually pressed start)
  - **await_ready (INTRODUCTION)**: Coach announces exercise enthusiastically ("Let's go... burpees set 1")
  - **set_start (WORK BEGIN)**: Silent (exercise already announced)
  - **set_midpoint (WORK 50%)**: Encouragement ("Halfway there, finish strong") - only for sets ≥20s
  - **set_10s_remaining**: Silent/context-only (save energy for completion)
  - **set_complete**: Ask for weight/reps, record data
  - **Flow**: await_ready (announce) → user confirms (silent) → countdown beeps → set_start (silent) → midpoint (encourage) → complete (ask data)
  - **Events sent to AI**: await_ready, set_start, set_midpoint, set_complete, block_transition, workout_complete, set_10s_remaining, rest_start, rest_complete
  - **Trigger events** (AI responds): await_ready, set_midpoint, set_complete, block_transition, workout_complete (5 total)
- **Beep Timing Fix**: Added 600ms minimum gap between countdown beeps to prevent rapid-fire caused by interval drift (840-945ms)
  - Prevents 3s and 2s beeps from playing 200-300ms apart when drift causes timeRemaining to skip values
  - `lastBeepTimeRef` tracks last beep timestamp with `canBeep` guard on all beep triggers
- **Graceful Workout Completion** (Oct 10, 2025)
  - **Issue**: WebSocket disconnected immediately when user clicked "End Workout", preventing AI farewell response
  - **Solution**: Added graceful shutdown sequence:
    1. Send `workout_complete` event to AI
    2. Wait for AI audio response to finish (`waitForAudioDone()` with 12s timeout)
    3. Gracefully disconnect WebSocket
    4. Complete workout and navigate
  - **Implementation**: Promise-based callback system with 12s safety timeout (matches catastrophic guard)
  - **Error Recovery**: Includes retry logic via `isEndingWorkoutRef` guard with onError/catch reset paths
  - **AI Instructions Update**: Changed workout_complete from "brief congratulations" to "SPEAK brief congratulations" with examples to ensure audio generation
- **CRITICAL FIX: Invalid Modalities Configuration** (Oct 12, 2025)
  - **Root cause**: Session config used `modalities: ['audio']` which OpenAI rejects (only supports `['text']` or `['audio', 'text']`)
  - **Cascading failures**:
    1. Session update rejected → instructions NEVER reach model → AI uses default behavior ("our first topic")
    2. `response.create` fails → `activeResponseRef` stuck true → event queue never processes → silence after intro
    3. All instruction fixes (exercise_name from event data, etc.) ignored because model never receives them
  - **Impact**: AI only spoke at introduction with generic text, then complete silence for all subsequent events
  - **Fix**: Changed session config to `modalities: ['audio', 'text']` (OpenAI-compliant format)
  - **Result**: Session instructions now reach the model, queue processes normally, AI speaks throughout workout with correct exercise names
- **CRITICAL FIX: Unwanted VAD Auto-Responses** (Oct 12, 2025)
  - **Root cause**: Server VAD (Voice Activity Detection) was enabled with `turn_detection: { type: 'server_vad' }`
  - **Impact**: After first response at await_ready, mic auto-resumed and VAD detected ambient noise, triggering unwanted second response ("Weight and reps?") at introduction instead of only at set_complete
  - **Fix**: Disabled turn detection entirely (`turn_detection: null`) since we use event-driven model where HOST controls all timing, not VAD
  - **Result**: AI responds ONLY to explicit events (await_ready, set_midpoint, set_complete), no unwanted follow-ups
- **CRITICAL FIX: Multi-Response Audio Playback** (Oct 12, 2025)
  - **Root cause**: AudioBufferSourceNode was being reused across responses - per WebAudio spec, a source node can only be started once, causing silent failures after first clip
  - **Diagnosis**: OpenAI sent all audio deltas successfully in PCM16 format, but same source node was reused without creating a NEW node for each response
  - **ChatGPT's fix**: 
    1. Wait for complete response (`response.audio.done`) before playing instead of streaming chunks
    2. Merge all Float32 chunks into single buffer
    3. Create NEW `AudioBufferSourceNode` for each response (critical - can only call `.start()` once per node)
    4. Reset queue and `isPlayingRef` at start of playback
    5. Use `src.onended` callback to handle completion and trigger next event
  - **Implementation**: Replaced `playAudioQueue` with `playPcmResponse` function in useRealtimeVoice.ts
  - **Result**: Coach now speaks at ALL events - introduction, midpoint encouragement, set completion, farewell
- **CRITICAL FIX: "Length must be at least 1" Crash** (Oct 12, 2025)
  - **Root cause**: `audioQueueRef.current = []` was being called at START of playPcmResponse, clearing the queue before buffer creation
  - **Impact**: After merging chunks into Float32Array, queue was cleared, causing `merged.length === 0` which crashes Web Audio API's `createBuffer()`
  - **ChatGPT's fix**:
    1. Remove `audioQueueRef.current = []` from start of playPcmResponse
    2. Add safety guard: `if (merged.length === 0) skip playback`
    3. Only clear queue in `src.onended` callback AFTER playback finishes
  - **Result**: Queue remains intact during buffer creation, prevents crashes on empty audio responses
- **CRITICAL FIX: Audio Speed-Up on Mobile** (Oct 12, 2025)
  - **Root cause**: `createBuffer()` used `ctx.sampleRate` (48kHz on mobile) instead of OpenAI's 24kHz, causing 2x playback speed
  - **Impact**: AI coach voice was speeded up and chipmunk-like on mobile browsers
  - **Fix**: Explicitly set buffer sample rate to 24000 to match OpenAI's audio format
  - **Result**: Audio plays at correct speed/pitch on both desktop and mobile
- **CRITICAL FIX: Database Foreign Key Error** (Oct 12, 2025)
  - **Root cause**: `coaching_sessions` table only referenced `workout_sessions_new`, but block workouts use `block_workout_sessions`
  - **Impact**: "Error Starting Workout" - foreign key constraint violation when creating coaching sessions for block workouts
  - **Fix**: 
    1. Added `blockWorkoutSessionId` field to `coaching_sessions` table (nullable)
    2. Made `sessionId` field nullable to support both session types
    3. Updated `getCoachingSession()` to query with `or(eq(sessionId), eq(blockWorkoutSessionId))`
    4. Updated `startBlockWorkoutSession()` to use `blockWorkoutSessionId` instead of `sessionId`
  - **Result**: Block workout sessions can now create coaching sessions without foreign key errors
- **CRITICAL FIX: Microphone Permission Re-Request (3min disconnect)** (Oct 13, 2025)
  - **Root cause**: `startListening()` called `getUserMedia()` every time, and auto-stop timeout triggered restart cycles causing mobile to re-request permissions
  - **Impact**: At ~3 minutes, microphone permission popup appeared on mobile; if user didn't accept, coach was lost for remainder of workout
  - **Fix**:
    1. Only call `getUserMedia()` once on first connect, reuse stream for entire workout
    2. Check if `mediaStreamRef`, `audioContextRef`, and `processorRef` exist before creating new ones
    3. Resume suspended AudioContext (iOS auto-suspends) instead of creating new ones
    4. Removed auto-stop timeout that was calling `stopListening()` after 8 seconds
    5. Added AudioContext resume after playback for iOS compatibility
  - **Result**: Single persistent microphone stream for entire workout, no mid-workout permission prompts
- **CRITICAL FIX: Stop Workout Button Not Working** (Oct 13, 2025)
  - **Root cause**: `/api/workout-sessions/:id/complete` only looked in `workoutSessionsNew` table, but block workouts are in `blockWorkoutSessions` table
  - **Impact**: "Session not found" error when trying to end block workout sessions
  - **Fix**:
    1. Added `completeBlockWorkoutSession()` function to storage that updates block workout sessions
    2. Updated completion route to try block workout completion first, then fall back to regular sessions
    3. Deletes associated coaching session when completing block workout
  - **Result**: Stop Workout button works for both regular and block workout sessions