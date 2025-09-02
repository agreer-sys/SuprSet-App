# SuprSet - Strength Training Superset Recommendation App

## Overview
SuprSet is a React-based web application designed to provide intelligent exercise superset recommendations for strength training. It leverages an extensive Airtable database of 194 exercises with detailed metadata and employs sophisticated pairing logic to suggest optimal exercise combinations. The project's vision is to build a community-driven AI system for real-time computer vision-based exercise analysis, enabling intelligent recommendations and user contributions for a proprietary dataset. Key capabilities include dual-mode recommendations (Trainer/Standard), real-time computer vision with pose and object detection, a community contribution system with quality controls, user authentication, and an AI training pipeline with intelligent image optimization.

## User Preferences
- **Development Process**: Maintain master TODO.md list - add all discussed/suggested features to this central roadmap
- **Feedback Style**: Continue challenging assumptions and providing counterpoints on pairing logic and design decisions
- **Testing Requirements**: Always confirm all adjustments work properly on mobile browser before reporting completion - mobile-first validation mandatory
- **Strategic Vision**: Build community-driven AI model rather than relying on generic solutions - create competitive moat through proprietary datasets

## Recent Changes (January 2025)
- **Enhanced Trainer Pairs Interface**: Added advanced exercise filtering system with category, equipment, and muscle group filters matching main "Select Exercise" functionality
- **Improved Navigation**: Integrated header navigation in trainer pairs page with Home and Super Sets links for seamless app navigation
- **User Experience Enhancements**: Added individual clear buttons for filter sections, increased exercise search results to 12 items, mobile-responsive design
- **Database Expansion**: Added 12 new tricep exercises, expanding from 194 to 206 total exercises with real-time Airtable sync
- **Database Consolidation Plan**: Simplified muscle group structure from 38 to 10 primary categories (Back, Chest, Shoulders, Biceps, Triceps, Legs, Glutes, Core, Posterior Chain, Accessory) with detailed secondary targeting
- **Authentication Status**: Authentication working on mobile but web preview shows 401 errors - temporarily deferred to focus on core functionality development

## System Architecture
The application follows a client-server architecture with a React frontend and an Express.js backend.

**Frontend (React + TypeScript)**
- **Framework**: React with TypeScript, Vite build system
- **Routing**: Wouter for client-side navigation
- **UI Components**: Shadcn/ui with Tailwind CSS styling
- **State Management**: React Query for server state, local useState for UI state
- **Key Components**: Exercise Selection, Recommendation Engine (dual-mode logic), Workout Timer, Exercise Modal.
- **UI/UX Decisions**: Focus on responsive design with Shadcn/ui and Tailwind CSS for a modern, clean interface. Mobile-first validation is critical.
- **Computer Vision Integration**: Utilizes MediaPipe BlazePose for human pose detection and COCO-SSD for object detection. Includes spatial mapping with equipment zones and a Roboflow API integration framework for custom dataset training. Configured for back-facing camera optimization and includes WebGL/WebGPU fallback.
- **Contribution System**: Comprehensive image contribution system with quality control, crowdsourced labeling, and gamification framework. Integrated with gym mapping interface, allowing for equipment tagging and privacy controls. Features an enhanced user tagging system with custom descriptive tags and batch upload capabilities with duplicate image detection.

**Backend (Express + Node.js)**
- **Server**: Express.js with TypeScript
- **Data Source**: Airtable API integration for exercise database
- **Storage**: PostgreSQL database for persistent data, replacing prior in-memory storage.
- **API Endpoints**: RESTful design for exercises, recommendations, search, and handling user contributions.
- **Authentication**: Full Replit Auth system with OpenID Connect integration, using a PostgreSQL database for session and user management.
- **AI Training Pipeline**: Supports image compression (640x640 pixels, 70% JPEG quality) for efficient training data handling. Includes a PostgreSQL schema for AI training optimization with automatic training dataset management (70% train, 15% validation, 15% test split), quality control (moderation status, duplicate detection), and a training data export API.

**Data Integration**
- **Airtable Service**: Handles API calls and data transformation for the exercise database.
- **Exercise Schema**: Standardized interface from Airtable to application with 206 exercises across simplified muscle group structure.
- **Caching Strategy**: 5-minute cache expiry for Airtable data with real-time sync for database updates.
- **Muscle Group Consolidation**: Simplified from 38 specific targets to 10 primary categories (Back, Chest, Shoulders, Biceps, Triceps, Legs, Glutes, Core, Posterior Chain, Accessory) with secondary muscle group detail for precise targeting.

**Recommendation System**
- **Standard Mode**: 0-100 scoring algorithm for broad recommendations.
- **Trainer Mode**: Binary pass/fail filtering based on strict professional criteria.
- **Pairing Logic**: Two-tier system combining curated exact exercise-to-exercise mappings with exercise type antagonist pairing (Push↔Pull, Squat↔Hinge, Lunge↔Hinge) for reliability.
- **Trainer Pairs Management**: Professional interface with advanced filtering (category, equipment, muscle group), analytics dashboard, and approval workflow for managing curated exercise pairings.

## External Dependencies
- **Airtable**: Primary database for exercise data.
- **MediaPipe BlazePose**: Used for human pose detection in computer vision.
- **COCO-SSD**: Used for baseline gym equipment object detection.
- **Roboflow**: API integration for custom dataset training and management for the AI model.
- **TensorFlow.js**: Underlying library for machine learning models, with CPU backend fallback for development environments.
- **PostgreSQL**: Database for user authentication, session management, and storing community contributions for AI training.
- **Replit Auth (OpenID Connect)**: For user authentication and session management.