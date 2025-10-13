# SuprSet - Strength Training Superset Recommendation App

## Overview
SuprSet is a React-based web application providing intelligent exercise superset recommendations for strength training. It aims to build a community-driven AI system for real-time computer vision-based exercise analysis, enabling intelligent recommendations and user contributions for a proprietary dataset. Key capabilities include dual-mode recommendations (Trainer/Standard), real-time computer vision with pose and object detection, a community contribution system with quality controls, user authentication, and an AI training pipeline. The business vision is to create a competitive moat through proprietary datasets and a community-driven AI model.

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