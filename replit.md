# SuprSet - Strength Training Superset Recommendation App

## Project Overview
SuprSet is a React-based web application that provides intelligent exercise superset recommendations for strength training. The app connects to an Airtable database containing 194 exercises with comprehensive metadata and uses sophisticated pairing logic to suggest optimal exercise combinations.

**Current Status**: Core functionality operational with dual-mode recommendation system
**Database**: 194 exercises from Airtable with 22+ fields per exercise
**Key Feature**: Trainer Mode vs Standard Mode for different user experience levels

## Project Architecture

### Frontend (React + TypeScript)
- **Framework**: React with TypeScript, Vite build system
- **Routing**: Wouter for client-side navigation
- **UI Components**: Shadcn/ui with Tailwind CSS styling
- **State Management**: React Query for server state, local useState for UI state
- **Key Components**:
  - Exercise Selection with autocomplete search
  - Recommendation Engine with dual-mode logic
  - Workout Timer for superset execution
  - Exercise Modal for detailed instructions

### Backend (Express + Node.js)
- **Server**: Express.js with TypeScript
- **Data Source**: Airtable API integration for exercise database
- **Storage**: In-memory storage with Airtable caching (5-minute refresh)
- **API Endpoints**: RESTful design for exercises, recommendations, search

### Data Integration
- **Airtable Service**: Handles API calls and data transformation
- **Exercise Schema**: Standardized interface from Airtable to application
- **Caching Strategy**: 5-minute cache expiry for performance optimization

### Recommendation System
- **Standard Mode**: 0-100 scoring algorithm with top 10 results
- **Trainer Mode**: Binary pass/fail filtering with strict professional criteria
- **Pairing Logic**: Two-tier system (exact pairs + exercise type compatibility)

## Recent Changes
- **2025-01-07**: Fixed Trainer Mode implementation - now correctly returns recommendations
- **2025-01-07**: Simplified pairing logic from complex family matching to reliable exercise type compatibility (Push↔Pull, Squat↔Hinge, Lunge↔Hinge)
- **2025-01-07**: Created comprehensive to-do list (TODO.md) for future development priorities
- **2025-01-07**: Computer Vision Integration - Phase 1 Complete:
  - Integrated MediaPipe BlazePose for 33-keypoint human pose detection
  - Added COCO-SSD object detection for baseline gym equipment recognition
  - Built spatial mapping system with equipment zones and crowd analysis
  - Created Roboflow API integration framework for custom dataset
  - Added proximity-based superset recommendations using spatial data
  - Configured back-facing camera for optimal gym environment scanning
  - Added WebGL/WebGPU fallback system for development environments
- **2025-01-07**: Created detailed Roboflow implementation guide (ROBOFLOW_IMPLEMENTATION.md):
  - Complete 12-week implementation timeline
  - 25+ equipment classes aligned with SuprSet exercise database  
  - Cost analysis and ROI projections ($49-249/month subscription)
  - Technical integration specifications and performance targets

## User Preferences
- **Development Process**: Maintain master TODO.md list - add all discussed/suggested features to this central roadmap
- **Feedback Style**: Continue challenging assumptions and providing counterpoints on pairing logic and design decisions

## Technical Decisions

### Pairing Logic Evolution
1. **Initial Approach**: Complex exercise family groupings with fuzzy name matching
2. **Issues Found**: Name inconsistencies causing failed matches (e.g., "Barbell Bench Press" not finding pairs)
3. **Current Solution**: Simplified two-tier system:
   - **Tier 1**: Curated exact exercise-to-exercise mappings for premium combinations
   - **Tier 2**: Exercise type antagonist pairing (Push↔Pull, Squat↔Hinge) using reliable Airtable field data

### Mode System Rationale
- **Standard Mode**: Encourages exploration and variety with scoring flexibility
- **Trainer Mode**: Enforces proven methodologies with binary pass/fail criteria
- **Benefits**: Serves both beginner exploration and professional precision needs

## Development Guidelines
- **Data Priority**: Always use authentic Airtable data, never mock/placeholder content
- **Architecture**: Frontend-heavy with minimal backend for data persistence and API calls
- **Storage**: In-memory preferred unless database specifically requested
- **Performance**: Parallel tool execution when possible, comprehensive solutions over incremental changes

## Key Files
- `TODO.md` - Master list of future development priorities
- `PAIRING_LOGIC.md` - Detailed documentation of recommendation algorithms
- `server/routes.ts` - Main API logic and recommendation calculation
- `server/airtable.ts` - Data source integration and caching
- `client/src/components/recommendation-engine.tsx` - Core UI component
- `shared/schema.ts` - Type definitions and data contracts

---
*Last updated: January 7, 2025*