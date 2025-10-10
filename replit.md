# SuprSet - Strength Training Superset Recommendation App

## Overview
SuprSet is a React-based web application providing intelligent exercise superset recommendations for strength training. It utilizes an extensive Airtable database of 194 exercises and sophisticated pairing logic. The project aims to build a community-driven AI system for real-time computer vision-based exercise analysis, enabling intelligent recommendations and user contributions for a proprietary dataset. Key capabilities include dual-mode recommendations (Trainer/Standard), real-time computer vision with pose and object detection, a community contribution system with quality controls, user authentication, and an AI training pipeline with intelligent image optimization. The vision is to create a community-driven AI system for real-time computer vision-based exercise analysis, enabling intelligent recommendations and user contributions for a proprietary dataset.

## User Preferences
- **Development Process**: Maintain master TODO.md list - add all discussed/suggested features to this central roadmap
- **Feedback Style**: Continue challenging assumptions and providing counterpoints on pairing logic and design decisions
- **Testing Requirements**: Always confirm all adjustments work properly on mobile browser before reporting completion - mobile-first validation mandatory
- **Strategic Vision**: Build community-driven AI model rather than relying on generic solutions - create competitive moat through proprietary datasets

## System Architecture
The application uses a client-server architecture with a React frontend and an Express.js backend.

**Frontend (React + TypeScript)**
- **Framework**: React with TypeScript, Vite.
- **Routing**: Wouter.
- **UI Components**: Shadcn/ui with Tailwind CSS for a responsive, modern interface. Mobile-first validation is crucial.
- **State Management**: React Query for server state, local `useState` for UI state.
- **Computer Vision**: Integrates MediaPipe BlazePose for human pose detection and COCO-SSD for object detection, with spatial mapping and Roboflow API for custom dataset training. Configured for back-facing camera optimization and WebGL/WebGPU fallback.
- **Contribution System**: Comprehensive image contribution system with quality control, crowdsourced labeling, gamification, and equipment tagging.

**Backend (Express + Node.js)**
- **Server**: Express.js with TypeScript.
- **Data Source**: Airtable API for exercise database.
- **Storage**: PostgreSQL database for persistent data, user management, and AI training data.
- **API Endpoints**: RESTful design for exercises, recommendations, search, and user contributions.
- **Authentication**: Full Replit Auth with OpenID Connect.
- **AI Training Pipeline**: Supports image compression and a PostgreSQL schema for AI training optimization with automatic dataset management and quality control.
- **AI Workout Coach (Event-Driven Observer)**: Real-time OpenAI Realtime API (GPT-3.5-turbo optimized) for conversational voice interaction with ~500ms latency and natural interruptions. **Architecture: Host controls all timing, AI observes via canonical events.** Server-side relay injects RAG knowledge base context. The coach receives full `executionTimeline` context for block workouts with throttled updates.
  - **Canonical Events**: set_start, set_10s_remaining, set_complete, rest_start, rest_complete, await_ready, user_ready, workout_complete
  - **Minimal-Chatter Prompt**: <4 second speech rule, event-driven responses only
  - **record_set Tool**: AI asks "Weight and reps?" after set_complete, logs performance data
  - **Beep System**: Long beeps at set_start/set_complete for precise timing feedback under music
- **Block-Based Workout Architecture**: Workouts are built from parameter-driven Blocks that compile into ExecutionTimelines with absolute timestamps. This replaces hardcoded workout formats with universal Block parameters. An admin panel for backend-only workout creation is in development.
- **Drift-Free Timeline Execution**: Utilizes an absolute timestamp system with drift detection and 15-second resync validation. Pause/resume functionality properly freezes elapsed time.
- **Adaptive Ready System (`await_ready`)**: Timeline automatically pauses at strategic points for real-world flexibility:
  - **Between Blocks**: Auto-inserted between all workout blocks, allowing rest and transition time
  - **After Rep-Based Sets**: Auto-inserted when exercises use `targetReps` (e.g., "12-15") instead of timed work
  - **User Activation**: Coach prompts "Say 'Ready' or 'Go'" - supports voice commands or UI button
  - **Timeline Re-anchoring**: When resumed, all future timestamps recalculate from current moment (drift-free)
  - **Phase 2 Vision**: Voice-based rep/weight tracking - user reports "13 reps", coach asks "What's the weight?", logs data for progressive overload
  - **FIX APPLIED**: 0-duration step detection now properly handles await_ready steps in timeline execution
- **Voice Prompts System**: Automatic AI coach announcements at key workout moments:
  - **Step Transitions**: Announces exercise name/duration when starting work periods
  - **10-Second Warnings**: Fires once per work interval with motivational cues
  - **Rest Periods**: Announces rest/transition duration
  - **FIX APPLIED**: Initial step now speaks correctly, 10s warnings fire exactly once using ref guards
- **Admin Authentication System**: `isAdmin` boolean field in the users table with dedicated middleware restricts access to `/api/admin/*` endpoints. Admin status is preserved across logins via the `upsertUser` function. Admin creation requires direct database access.

## Recent Fixes (Oct 9, 2025)
- **CRITICAL FIX #1: Session Instructions Not Updated with Workout Timeline**:
  - **Root cause**: Initial connection sent session.update with NO workout timeline, then when timeline was sent via session.update_context, instructions were never updated
  - **Impact**: AI had "Respond with natural spoken audio" instructions but no workout context, so it couldn't respond meaningfully to events
  - **Fix**: Properly detect when timeline is loaded for first time (`hasTimelineNow && !hadTimeline`) and send updated instructions
  - **Result**: AI now receives full workout timeline context and can respond to events appropriately
- **CRITICAL FIX #2: Session Update Flooding (Previous Bug)**:
  - **Root cause**: `updateSessionContext` sent `session.update` to OpenAI every 5-15 seconds (on every step change)
  - **Impact**: Constant instruction updates interrupted AI responses
  - **Fix**: Only send `session.update` when timeline is first loaded, not on every step transition
- **CRITICAL FIX #3: Audio Generation Instructions**: Fixed server-side instruction that was suppressing audio
  - **Root cause**: `buildSessionInstructions` had "Output plain text (host handles TTS)"
  - **Fix**: Replaced with "Respond with natural spoken audio"
- **NEW: Countdown Beeps for INSTRUCTION Step**:
  - Added 3-count beeps at end of pre-workout instruction (short at 3s, short at 2s, long at 1s)
  - Matches REST countdown pattern to signal workout is about to begin
- **Event Queue System with "Always Send / Conditional Respond" Pattern**: Ensures AI has full workout context
  - **ALL events sent to AI** for context (set_start, set_complete, rest_start, rest_complete, set_10s_remaining, await_ready, workout_complete)
  - `shouldTriggerResponse()` helper determines which events trigger AI speech:
    - **Trigger events** (AI responds): set_start, set_complete, await_ready, user_ready, block_transition, workout_complete
    - **Context-only events** (AI receives but doesn't respond): set_10s_remaining (beeps handle this), rest_start (beeps handle countdown), rest_complete
  - FIFO event queue prevents response overlap - if AI is speaking, trigger events are queued
  - **Speech throttling safeguards**: 
    - Primary: response.audio.done and response.done/response.completed listeners clear active flag
    - Backup: 12s catastrophic timeout in case OpenAI never sends completion events (safety valve only)
  - On `response.audio.done`: reset flag, clear timeout, then `processQueuedEvent()` processes next queued event
  - Queue cleared on disconnect to prevent stale events across sessions
  - **Optimization (Oct 10)**: Trimmed trigger list from 8 to 6 events to prevent queue congestion - beeps now handle 10s warnings and rest countdowns
- **Coach Timing Optimization**: Moved coach speech from WORK start to REST periods
  - Coach introduces NEXT exercise during REST, not at work start
  - `rest_start` event now includes `next_exercise` and `next_set` data for contextual introduction
  - Reduces interruptions during active work periods
- **Instruction Duration**: Increased pre-workout instruction from 5s to 10s in timeline compiler for better user onboarding
- **AudioContext Fix**: Added `resumeAudioContext()` call to Start Workout button ensuring beeps play immediately
  - AudioContext now resumes on both mic toggle AND workout start
  - Resolves browser autoplay policy restrictions
- **Intelligent Beep System (TIME-based workouts only)**:
  - **REST countdown**: Short beeps at 3s and 2s, long beep at 1s (prepares user for work)
  - **WORK countdown**: Long beep at 1s remaining (signals end approaching)
  - **REP-based workouts**: No countdown beeps - uses `await_ready` manual gate instead
  - Removed old boundary beeps (set_start/set_complete) in favor of countdown system
  - Step-based tracking prevents duplicate beeps using Set data structure

## Recent Fixes (Oct 8, 2025)
- **Event-Driven AI Coach Refactor**: Completed migration from function-calling to observer pattern
  - Removed all legacy workflow control functions (confirm_ready, start_countdown, start_rest_timer, next_exercise)
  - Implemented canonical event system (set_start, set_10s_remaining, set_complete, rest_start, rest_complete, await_ready, user_ready, workout_complete)
  - Added sendEvent function in useRealtimeVoice hook for structured event messaging
  - Eliminated function-call handlers from client - AI can no longer control workflow
  - All events include exercise_id and exercise_name from timeline for proper context
- **Timeline Compilation**: Fixed `createBlockWorkout` to use `compileWorkoutTimeline()` instead of manual compilation, ensuring initial await_ready steps and exercise names are included
- **0-Duration Step Detection**: Fixed step-finding logic to properly detect await_ready steps (duration=0) by checking `elapsed >= atMs` instead of requiring `elapsed < endMs`
- **Exercise Names in Voice Prompts**: NEW workouts now include exercise names in voice prompts; old workouts still have broken timeline structure in database
- **End Workout Button**: Temporarily removed auth requirement to allow guest users (SECURITY RISK: needs token-based protection)
- **CRITICAL**: Users must create NEW workouts for fixes to apply - existing workouts in database have old timeline structure

## Known Issues & TODO
- **SECURITY**: `/api/workout-sessions/:id/complete` endpoint lacks protection - any caller can close arbitrary sessions if they know the ID (needs opaque token or auth guard)
- **OLD WORKOUTS**: Existing workouts in database have manually-compiled timeline without await_ready steps or exercise names - need to be recreated

**Data Integration**
- **Airtable Service**: Handles API calls and data transformation.
- **Exercise Schema**: Standardized interface from Airtable to application.
- **Caching**: 5-minute cache expiry for Airtable data with real-time sync.
- **Muscle Group Consolidation**: Simplified from 38 to 10 primary categories (Back, Chest, Shoulders, Biceps, Triceps, Legs, Glutes, Core, Posterior Chain, Accessory) with secondary targeting.

**Recommendation System**
- **Standard Mode**: 0-100 scoring algorithm.
- **Trainer Mode**: Binary pass/fail filtering based on strict criteria.
- **Pairing Logic**: Two-tier system combining curated exact exercise-to-exercise mappings with exercise type antagonist pairing.
- **Trainer Pairs Management**: Professional interface with advanced filtering, analytics, and approval workflow.
- **Block Format Conversion (NEW)**: Two API endpoints convert superset recommendations to Block format compatible with the compiler pipeline:
  - `/api/recommendations/preview-block` (public) - Read-only preview of Block structure
  - `/api/recommendations/create-block` (admin) - Converts pairs to Blocks for admin panel
  - Proper numeric validation/coercion prevents string concatenation bugs
  - Full Airtable exercise snapshots included for coach context
  - Default params: 3 sets, 45s work, 60s rest, 10s transition

## External Dependencies
- **Airtable**: Primary database for exercise data.
- **MediaPipe BlazePose**: Human pose detection.
- **COCO-SSD**: Baseline gym equipment object detection.
- **Roboflow**: API for custom dataset training and management.
- **TensorFlow.js**: Machine learning models library.
- **PostgreSQL**: Database for user authentication, session management, and AI training data.
- **Replit Auth (OpenID Connect)**: User authentication and session management.
- **OpenAI Realtime API (GPT-3.5-turbo)**: Powers the AI Workout Coach.
- **LangChain**: Orchestrates AI coach conversations (used for context management).