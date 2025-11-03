# SuprSet - Strength Training Superset Recommendation App

## Overview
SuprSet is a React-based web application providing intelligent exercise superset recommendations for strength training. Its primary purpose is to build a community-driven AI system for real-time computer vision-based exercise analysis, enabling intelligent recommendations and user contributions for a proprietary dataset. Key capabilities include dual-mode recommendations (Trainer/Standard), real-time computer vision, a community contribution system with quality controls, user authentication, and an AI training pipeline. The business vision aims to create a competitive moat through proprietary datasets and a community-driven AI model.

## User Preferences
- **Development Process**: Maintain master TODO.md list - add all discussed/suggested features to this central roadmap
- **Feedback Style**: Continue challenging assumptions and providing counterpoints on pairing logic and design decisions
- **Testing Requirements**: Always confirm all adjustments work properly on mobile browser before reporting completion - mobile-first validation mandatory
- **Strategic Vision**: Build community-driven AI model rather than relying on generic solutions - create competitive moat through proprietary datasets

## Recent Changes

### ✅ Canonical Architecture Migration (Nov 3, 2025)
Migrated to ChatGPT's canonical event-driven architecture for cleaner, modular coaching system:

**Why This Change:**
- Resolved architectural drift between ChatGPT patches and Replit implementation
- Established single source of truth for timeline compilation and coaching logic
- Improved maintainability and future extensibility

**What Changed:**
1. **Timeline Compiler (server/timeline-compiler.ts)**:
   - ✅ Rep-based rounds now emit **single work step with exercises array** instead of separate steps per exercise
   - Format: `{ type: "work", exercises: [...], round: N, durationSec: 180 }`
   - User completes all exercises within round window at their own pace
   - Canonical round transitions preserved (beep→voice→countdown→GO at T0+5.6s)

2. **Workout Player (client/src/pages/workout-session.tsx)**:
   - ✅ Updated to handle both `exercise` (single) and `exercises` (array) formats
   - Exercise extraction for coach context supports both patterns
   - Timeline display shows combined exercises (e.g., "Bench Press + Barbell Row")
   - Event emission extracts first exercise ID for canonical coach events

3. **Observer & Voice System**:
   - Already aligned with canonical event-driven pattern
   - Database-backed response selection with cooldown tracking
   - VoiceBus with ducking and TTS guard window

**Example Timeline (180s round with 2 exercises):**
```
Round 1:
  Step 1: [Bench Press + Barbell Row] (180s total) - exercises: [{id:123}, {id:456}]
  → End beep
  → "Round rest" voice (T0+700ms)
  → Countdown pips (T0+3s, T0+4s)
  → GO beep (T0+5s)
Round 2:
  Step 2: [Bench Press + Barbell Row] (180s total, starts at T0+5.6s)
```

**Backward Compatibility:**
- Traditional time-based and straight-sets workouts use `exercise` (single) format
- Await_ready flow available for non-rep modes
- All existing database, admin UI, and Airtable integrations preserved

**Backup:**
- Previous implementation backed up to `backup_replit_implementation_2025-11-03/`

### Browser TTS Default (Nov 3, 2025)
Browser TTS is now the default for all testing to avoid API quota issues:
- **Default**: Free browser TTS (unlimited testing, same coaching logic)
- **Switch to OpenAI**: Add `?realtimeAPI` to URL when needed
- **Benefits**: No API quota consumption during development and testing

## System Architecture
The application uses a client-server architecture with a React frontend and an Express.js backend, built for bulletproof reliability and graceful degradation. The AI coach responsibility is split: the local Replit app handles all timing, beeps, coaching intelligence, and workout execution, while the remote OpenAI Realtime API handles voice synthesis ONLY.

**Frontend (React + TypeScript)**
- **Framework**: React with TypeScript, Vite.
- **UI**: Shadcn/ui with Tailwind CSS for a responsive, mobile-first interface.
- **Computer Vision**: Integrates MediaPipe BlazePose for human pose detection and COCO-SSD for object detection, with spatial mapping and Roboflow API integration.
- **Contribution System**: Supports image contributions with quality control and crowdsourced labeling.
- **Timeline Player**: Converts server-compiled ExecutionTimelines into coach events.
- **Workout Player**: Fetches and executes block workouts with coach integration.
- **Preflight Weights**: kg/lbs toggle with auto-conversion.
- **Beep System**: Deterministic Web Audio API-based beeps optimized for earbud listening with voice coordination.
- **Voice Ducking Bus**: WebAudio gain bus for smooth voice attenuation during beeps.
- **Canonical Round Transitions**: Standardized timing for rep-round workouts with centralized constants.
- **Downstream Tech Cue System**: Intelligent A2/A3 technical hints for rep-round workouts with chatter-awareness and guardrails.

**Backend (Express + Node.js)**
- **Server**: Express.js with TypeScript.
- **Data Source**: Airtable API for exercise data.
- **Storage**: PostgreSQL database for persistent data, user management, and AI training data.
- **Authentication**: Replit Auth with OpenID Connect.
- **AI Training Pipeline**: Supports image compression and a PostgreSQL schema for AI training optimization.
- **AI Workout Coach (Event-Driven Observer)**: Real-time OpenAI API for conversational voice interaction. The host controls timing, and the AI observes via canonical events. Server-side relay injects RAG knowledge base context. Includes pattern-aware, mode-aware response system with cooldown pooling.
    - **Canonical Events**: Standardized events for workout progression (e.g., `EV_WORK_START`, `EV_REST_END`).
    - **Response System**: Database-backed coach responses with filtering, cooldown system, and priority-based selection.
- **Block-Based Workout Architecture**: Workouts are built from parameter-driven Blocks that compile into ExecutionTimelines with absolute timestamps.
- **Drift-Free Timeline Execution**: Uses an absolute timestamp system with drift detection and robust pause/resume functionality.
- **Adaptive Ready System (`await_ready`)**: Timeline pauses at strategic points for user readiness signals.
- **Voice Prompts System**: Automatic AI coach announcements.
- **Admin Authentication System**: `isAdmin` field in users table restricts access to admin endpoints.
- **Voice Playback Pipeline**: Production-ready PCM16 → Float32Array pipeline with comprehensive validation.

**Data Integration**
- **Airtable Service**: Handles API calls and data transformation for exercise data.
- **Muscle Group Consolidation**: Standardized 38 muscle groups into 10 primary categories.

**Recommendation System**
- **Standard Mode**: 0-100 scoring algorithm for exercise pairing.
- **Trainer Mode**: Binary pass/fail filtering based on strict criteria.
- **Pairing Logic**: Two-tier system combining curated exact pairings with exercise type antagonist pairing.
- **Block Format Conversion**: API endpoints convert superset recommendations to the Block format.

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