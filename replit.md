# SuprSet - Strength Training Superset Recommendation App

## Overview
SuprSet is a React-based web application providing intelligent exercise superset recommendations for strength training. It aims to build a community-driven AI system for real-time computer vision-based exercise analysis, enabling intelligent recommendations and user contributions for a proprietary dataset. Key capabilities include dual-mode recommendations (Trainer/Standard), real-time computer vision with pose and object detection, a community contribution system with quality controls, user authentication, and an AI training pipeline. The business vision is to create a competitive moat through proprietary datasets and a community-driven AI model.

## Core Architectural Principles

### AI Coach Responsibility Split (CRITICAL - DO NOT DRIFT)
**Local (Replit App) Handles:**
- ⏱️ **All timing**: Work/rest timers, countdown, drift detection, resync
- 🔔 **All beeps**: Short beeps (3-2-1), long beeps (start/end of sets)
- 🧠 **All coaching intelligence**: Response selection, cooldown tracking, priority ranking, speech queue, coalescing logic
- 🎯 **Workout execution**: Step transitions, event firing, pause/resume, timeline control

**Remote (OpenAI Realtime API) Handles:**
- 🎙️ **Voice synthesis ONLY**: Receives text string → returns speech audio
- ❌ **NO workout logic**: Does not control timing, does not select what to say, does not manage state

**Why This Matters:**
- ✅ **Bulletproof reliability**: Workout never stalls if API or connection drops
- ✅ **Security isolation**: AI has zero access to database, algorithms, or sensitive data
- ✅ **Graceful degradation**: If API fails, workout continues with beeps/UI (silent coach)

**Data Flow to AI:**
The AI receives pre-compiled workout timeline context including:
- Exercise names, IDs, coaching cues (bullet points), equipment, muscle groups
- Timing information (work/rest durations), set/round numbers, workout structure
- ❌ Does NOT receive: Raw database access, superset algorithm, pairing logic, user personal data

**Analogy**: Replit App = Director + Scriptwriter + Timekeeper | OpenAI API = Voice actor reading the script

## User Preferences
- **Development Process**: Maintain master TODO.md list - add all discussed/suggested features to this central roadmap
- **Feedback Style**: Continue challenging assumptions and providing counterpoints on pairing logic and design decisions
- **Testing Requirements**: Always confirm all adjustments work properly on mobile browser before reporting completion - mobile-first validation mandatory
- **Strategic Vision**: Build community-driven AI model rather than relying on generic solutions - create competitive moat through proprietary datasets

## Recent Changes

### Phase 3 Merge (Oct 28, 2025)
Integrated Lab improvements into production app with COACH_V2 feature flag for safe rollback:

**Changes:**
1. **Feature Flag System**: Added `FLAGS.COACH_V2` (defaults OFF, enable via `?coachV2` URL param) for gated rollout and rollback control
2. **Beep Module Integration**: Replaced raw Web Audio beeps with `beeps.ts` module (earbud-optimized tones with voice ducking)
3. **EV_WORK_PREVIEW Event**: Added exercise preview during REST steps (HIGH chatter only) - announces upcoming exercise before work starts
4. **Cue-Only Work Start**: Updated `EV_WORK_START` fallback to provide form cues only (no exercise name repetition since preview announced it)
5. **Canonical Constants Verified**: Server timeline compiler and client round scheduler use identical `ROUND_END_TO_SPEECH_MS` and `ROUND_END_TO_COUNTDOWN_MS` constants
6. **Database Index Verified**: `coach_responses_dims_idx` composite index confirmed for optimal query performance

**Architecture:**
- Lab environment remains as permanent testing sandbox (`/lab/*` routes)
- Server-compiled ExecutionTimeline is authoritative scheduler
- Client emits coach events from timeline steps (no client-side round schedulers)
- Feature flag gates all V2 behavior for safe rollback

**Testing:**
- QA checklist: Flag ON/OFF modes, beep timing, chatter levels, preview/cue separation, pause/resume
- Architect review: PASS - Rollback guarantees maintained, legacy flow intact when flag OFF

## System Architecture
The application uses a client-server architecture with a React frontend and an Express.js backend.

**Frontend (React + TypeScript)**
- **Framework**: React with TypeScript, Vite.
- **UI**: Shadcn/ui with Tailwind CSS for a responsive, mobile-first interface.
- **Computer Vision**: Integrates MediaPipe BlazePose for human pose detection and COCO-SSD for object detection, with spatial mapping and Roboflow API integration.
- **Contribution System**: Supports image contributions with quality control and crowdsourced labeling.
- **Timeline Player**: `TimelinePlayer.ts` converts server-compiled ExecutionTimeline objects into coach events, mapping work/rest/await_ready steps to the event system.
- **Workout Player**: Fetches real block workouts with compiled timelines from `/api/block-workouts` endpoint and executes them with coach integration.
- **Preflight Weights**: kg/lbs toggle with auto-conversion (default: lbs). Converts all entered weights when switching units, rounded to 1 decimal place.
- **Beep System (v1.1-earbud, Oct 27, 2025)**: Deterministic Web Audio API-based beeps optimized for comfortable earbud listening. Features:
  - **SHORT PIP**: 180ms @ 650Hz with 12ms attack/120ms release (countdown, last-5/10 warnings)
  - **LONG BEEP**: 550ms @ 520Hz with soft envelope (start/end transitions)
  - **CONFIRM CHIRP**: 160ms @ 720→1080Hz chirp (user tap feedback)
  - **Low-pass filter**: 1600Hz @ Q=0.7 to reduce harshness in earbuds
  - **Softer gain**: 0.60/0.55 peak (vs 0.85 original) for gentle audio cues
  - **Volume control**: `setSignalsVolume()` method for per-session adjustment
  - **Voice Coordination**: ±250ms TTS suppression window around beeps
  - **Test Harness**: `/lab/beeps` route for manual beep testing and sequence validation
- **Voice Ducking Bus (v1.0, Oct 27, 2025)**: WebAudio gain bus routing all coach voice through a single channel with automatic ducking. Features:
  - **Smooth Ducking**: -6dB voice attenuation during beeps with 20ms ramp up/down
  - **Guard Window**: ±250ms TTS start suppression to prevent voice/beep collisions
  - **Multi-Source Support**: Routes HTMLAudioElement, MediaStream, or browser TTS through unified bus
  - **iOS Compatible**: User gesture requirement for AudioContext initialization
  - **Integration**: Beeps automatically trigger voice ducking via `beeps.setDucker()` callback
- **Canonical Round Transitions (v1.0, Oct 27, 2025)**: Standardized timing for rep-round workouts with centralized scheduler. Features:
  - **T0**: End beep (600ms long beep triggered by client)
  - **T0 + 700ms**: "Round rest" voice (beep clears + 100ms safety)
  - **T0 + 3000ms**: First countdown pip (220ms short pip)
  - **T0 + 4000ms**: Second countdown pip (220ms short pip)
  - **T0 + 5000ms**: GO beep (600ms long beep)
  - **T0 + 5600ms**: Next work starts (200ms after GO beep ends)
  - **Centralized constants**: `ROUND_END_TO_SPEECH_MS = 700`, `ROUND_END_TO_COUNTDOWN_MS = 3000`, `WORK_START_OFFSET_MS = 5600`
  - **Single source of truth**: `client/src/coach/roundBetweenScheduler.ts` for client, mirrored in `server/timeline-compiler.ts` for server
  - **Timeline compilation**: Server stamps canonical timestamps into timeline; client beep handler differentiates pips (220ms) vs GO (600ms) by duration
- **Downstream Tech Cue System (v1.0, Oct 27, 2025)**: Intelligent A2/A3 technical hints for rep-round workouts with comprehensive guardrails. Features:
  - **Chatter-aware**: Only fires on `high` chatter level (rounds 2+)
  - **A2 preferred**: Fires A2 hint ~3s after window start; A3 only if A2 didn't fire
  - **Optional alternation**: Even rounds use A3, odd rounds use A2 (configurable via `ALTERNATE_TECH_HINT`)
  - **Confidence threshold**: ≥70% confidence required
  - **Time guard**: ≥20s remaining in round
  - **Voice coordination**: Honors voiceBus guard window (±250ms beep collision avoidance)
  - **Implementation**: `cuePolicy.ts` (constants/guards), `downstreamTech.ts` (scheduler)

**Backend (Express + Node.js)**
- **Server**: Express.js with TypeScript.
- **Data Source**: Airtable API for exercise data.
- **Storage**: PostgreSQL database for persistent data, user management, and AI training data.
- **Authentication**: Replit Auth with OpenID Connect.
- **AI Training Pipeline**: Supports image compression and a PostgreSQL schema for AI training optimization.
- **AI Workout Coach (Event-Driven Observer)**: Real-time OpenAI API for conversational voice interaction. The host controls timing, and the AI observes via canonical events. Server-side relay injects RAG knowledge base context. Includes pattern-aware, mode-aware response system with cooldown pooling.
  - **Canonical Events**: `EV_BLOCK_START`, `EV_COUNTDOWN`, `EV_WORK_START`, `EV_WORK_END`, `EV_REST_START`, `EV_REST_END`, `EV_ROUND_REST_START`, `EV_ROUND_REST_END`, `EV_BLOCK_END`, `EV_WORKOUT_END`, `EV_AWAIT_READY`.
  - **Response System (Production, Oct 27, 2025)**: Database-backed coach responses with filtering by event_type, pattern, mode, and chatter_level. Uses cooldown system and priority-based selection. Async database-first approach with in-memory fallback for resilience. API endpoints: `/api/coach-responses` (GET with filters), `/api/coach-responses/:id/mark-used` (POST). Database table: `coach_responses` with ~50 seed responses covering all canonical events.
- **Block-Based Workout Architecture**: Workouts are built from parameter-driven Blocks that compile into ExecutionTimelines with absolute timestamps, allowing for universal workout parameterization.
- **Drift-Free Timeline Execution**: Uses an absolute timestamp system with drift detection and resync validation, including robust pause/resume functionality.
- **Adaptive Ready System (`await_ready`)**: The timeline automatically pauses at strategic points for flexibility, allowing users to signal readiness via voice or UI.
- **Voice Prompts System**: Automatic AI coach announcements at key workout moments.
- **Admin Authentication System**: `isAdmin` boolean field in the users table with dedicated middleware restricts access to `/api/admin/*` endpoints.
- **Voice Playback Pipeline (v1.0-voice-stable, Oct 13, 2025)**: Production-ready PCM16 → Float32Array pipeline with comprehensive validation. Features include:
  - **Audio Sanity Ping**: 1-second 220Hz tone validates AudioContext playback before first AI message
  - **Automated Test Suite**: Sequential and overlapping event validation with 6/6 events passing, 0 errors
  - **Mic Persistence**: Single MediaStream reused throughout workout, no permission popups
  - **Startup Logging**: Console confirms "🎧 Voice pipeline initialized (PCM16 Float32 path active)"
  - **Test Results**: All playback events passed sequential and overlap validation

**Data Integration**
- **Airtable Service**: Handles API calls and data transformation for exercise data.
- **Muscle Group Consolidation**: Standardized 38 muscle groups into 10 primary categories.

**Recommendation System**
- **Standard Mode**: 0-100 scoring algorithm for exercise pairing.
- **Trainer Mode**: Binary pass/fail filtering based on strict criteria.
- **Pairing Logic**: Two-tier system combining curated exact pairings with exercise type antagonist pairing.
- **Block Format Conversion**: API endpoints (`/api/recommendations/preview-block`, `/api/recommendations/create-block`) convert superset recommendations to the Block format for the compiler pipeline, including Airtable exercise snapshots.

## Known Issues
- **Stallwart Ping Errors**: Console shows "stallwart: failed ping" errors from Replit's build infrastructure. These are non-critical and do not affect workout functionality.

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