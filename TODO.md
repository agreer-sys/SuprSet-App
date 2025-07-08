# SuprSet Development To-Do List

## High Priority Features

### 1. Community-Driven AI Model (Strategic Priority)
- [ ] **Image Contribution System**: Users submit gym equipment photos during workouts
- [ ] **Crowdsourced Labeling**: Gamified equipment tagging with accuracy rewards
- [ ] **Model Training Pipeline**: Automated retraining with new community data
- [ ] **Quality Control**: Image validation and duplicate detection systems
- [ ] **Data Privacy**: Gym location anonymization and user consent management
- [ ] **Incentive System**: Better recommendations for active contributors
- [ ] **Model Performance Tracking**: Accuracy metrics and user feedback loops

### 2. User Experience Enhancements
- [ ] **Workout History Tracking**: Save completed superset sessions with timing data
- [ ] **Personal Preferences**: Remember user's favorite equipment/muscle groups
- [ ] **Exercise Instructions Modal**: Enhanced viewing with images/videos from Airtable
- [ ] **Mobile Responsiveness**: Optimize layout for phone/tablet usage
- [ ] **Workout Export**: Share or save workout plans as PDF/text

### 3. Pairing Logic Improvements
- [ ] **Equipment Zone Optimization**: Prioritize exercises in same gym area
- [ ] **Rest Period Matching**: Pair exercises with compatible rest requirements
- [ ] **Setup Time Considerations**: Avoid complex equipment transitions
- [ ] **User Feedback Learning**: Track which pairs users actually complete
- [ ] **Expand Curated Pairs**: Add more trainer-approved exact combinations

### 4. Performance & Data
- [ ] **Airtable Caching Strategy**: Reduce API calls with intelligent refresh
- [ ] **Search Performance**: Optimize autocomplete for 194+ exercises
- [ ] **Offline Mode**: Cache essential data for gym use without internet
- [ ] **Data Validation**: Handle missing/malformed Airtable fields gracefully
- [ ] **Error Recovery**: Robust handling of Airtable API failures

## Medium Priority Features

### 5. Advanced Workout Features
- [ ] **Custom Workout Builder**: Multi-superset session planning
- [ ] **Progressive Overload Tracking**: Weight/rep progression over time
- [ ] **Workout Templates**: Pre-built routines (Upper/Lower, Push/Pull/Legs)
- [ ] **Timer Customization**: Adjustable rest periods and work intervals
- [ ] **Exercise Substitutions**: Alternative exercises for equipment unavailability

### 6. Social & Sharing
- [ ] **Workout Sharing**: Share favorite supersets with friends
- [ ] **Community Pairs**: User-submitted pairing recommendations
- [ ] **Trainer Integration**: Professional trainer can create client workouts
- [ ] **Progress Photos**: Before/after tracking with workout correlation
- [ ] **Achievement System**: Badges for workout consistency/milestones

### 7. Analytics & Insights
- [ ] **Workout Analytics**: Time spent, calories estimated, volume tracking
- [ ] **Pairing Success Rate**: Which combinations users complete vs skip
- [ ] **Equipment Usage Patterns**: Most/least used equipment identification
- [ ] **Muscle Group Balance**: Ensure balanced training over time
- [ ] **Performance Trends**: Strength gains visualization

## Low Priority / Future Considerations

### 7. Integration Opportunities
- [ ] **Fitness App Sync**: Connect with MyFitnessPal, Apple Health, etc.
- [ ] **Wearable Integration**: Heart rate monitoring during supersets
- [ ] **Gym Equipment APIs**: Real-time equipment availability at partner gyms
- [ ] **Nutrition Suggestions**: Post-workout meal recommendations
- [ ] **Recovery Tracking**: Sleep quality correlation with workout performance

### 8. Visual AI & Spatial Intelligence
- [x] **Phase 0 - Foundation (COMPLETE)**:
  - [x] MediaPipe BlazePose integration (33-keypoint pose detection)
  - [x] COCO-SSD baseline object detection
  - [x] Spatial mapping system with equipment zones
  - [x] Back-facing camera configuration for gym scanning
  - [x] WebGL/WebGPU fallback system for development environments
- [ ] **Phase 1 - Custom Dataset Creation (Roboflow) - NEXT PRIORITY**:
  - [ ] Create private Roboflow account ($49-249/month for private datasets)
  - [ ] Collect gym equipment photos (target: 1,000+ images across 20+ equipment types)
  - [ ] Use Roboflow Auto Label for AI-assisted annotation ($0.05/bounding box)
  - [ ] Train custom model for SuprSet-specific equipment detection
  - [ ] Equipment classes: Bench Press, Squat Rack, Dumbbells, Cable Machine, Leg Press, Smith Machine, Lat Pulldown, Cable Crossover, Leg Extension, Leg Curl, etc.
- [ ] **Phase 2 - Production AI Integration**:
  - [ ] Replace COCO-SSD with custom Roboflow model via REST API
  - [ ] Maintain MediaPipe BlazePose for 33-keypoint pose estimation 
  - [ ] Combine custom equipment detection + pose data for context-aware recommendations
  - [ ] Add equipment confidence scoring and validation
- [ ] **Phase 3 - Spatial Mapping**:
  - [ ] Create spatial layout of gym with precise equipment positioning
  - [ ] Map equipment relationships and proximity for superset optimization
  - [ ] Implement 3D coordinate system for gym floor layout
  - [ ] Generate equipment zones (cardio, strength, free weights, functional)
- [ ] **Phase 4 - Community & Geolocation**:
  - [ ] Geolocation integration: Save gym layouts by GPS coordinates 
  - [ ] Shared gym database: Access pre-mapped layouts from other users
  - [ ] Real-time equipment availability status tracking
  - [ ] Crowd level analysis using pose detection data
- [ ] **Phase 5 - Intelligence & Optimization**:
  - [ ] Optimal workout flow: Route planning based on superset requirements
  - [ ] Space utilization analysis and optimal timing suggestions
  - [ ] Equipment usage pattern recognition
  - [ ] Proximity-based superset recommendations

### 9. Business Features
- [ ] **Subscription Tiers**: Premium features for advanced users
- [ ] **Gym Partnerships**: White-label solutions for fitness centers
- [ ] **Trainer Certification**: Professional pairing logic validation
- [ ] **API Access**: Third-party integrations for fitness apps
- [ ] **Corporate Wellness**: Team challenges and group workouts

### 10. Technical Debt & Maintenance
- [ ] **Code Documentation**: Comprehensive API documentation
- [ ] **Test Coverage**: Unit tests for pairing logic and data handling
- [ ] **Database Migration**: Move from in-memory to persistent storage
- [ ] **Security Audit**: Data privacy and API security review
- [ ] **Performance Monitoring**: Real-time error tracking and analytics

## Completed Items ✅
- [x] Trainer Mode implementation with binary filtering
- [x] Exercise type compatibility (Push↔Pull, Squat↔Hinge)
- [x] Curated trainer-approved pairs system
- [x] Airtable integration with 194 exercises
- [x] Standard Mode with 0-100 scoring algorithm
- [x] Comprehensive pairing logic documentation
- [x] Exercise search and filtering functionality
- [x] Basic workout timer implementation

## Strategic Decision Points

### Current Crossroads: Database Refinement vs Visual AI (January 2025)
**Question**: Continue refining pairing logic/database OR pivot to Visual AI spatial awareness features?

**Database Refinement Path** (Incremental value):
- Perfect existing 194 exercise pairings
- Add more curated trainer pairs  
- Optimize equipment zone logic
- Estimated effort: 2-4 weeks for substantial improvement

**Visual AI Path** (Exponential value potential):
- Camera-based gym mapping
- Equipment recognition via computer vision
- Geolocation + community sharing
- Estimated effort: 2-3 months for MVP, significant technical complexity

**Decision Made**: **Pivot to Visual AI MVP** 
- Current pairing logic is functional and sufficient for user validation
- Visual AI creates unique competitive moat and network effects
- Starting technical feasibility prototype - camera access + basic computer vision

## Decision Log
- **2025-01-07**: Simplified pairing logic from complex family matching to reliable exercise type compatibility
- **2025-01-07**: Implemented dual-mode system (Standard vs Trainer Mode) for flexibility
- **2025-01-07**: Resolved Trainer Mode bugs through antagonist muscle pattern approach
- **2025-01-07**: Added Visual AI & Spatial Intelligence features to roadmap - identified as key differentiator
- **2025-01-07**: Research completed on computer vision models:
  - **Equipment Detection**: Roboflow dataset with 6,620 images covering 13 gym equipment classes (61.8% mAP accuracy)
  - **Pose Estimation**: MediaPipe BlazePose provides 33 keypoints with 3D coordinates, optimized for fitness
  - **Implementation**: TensorFlow.js integration allows browser-based real-time processing
  - **Ready-to-use APIs**: Both models available via REST APIs and JavaScript libraries
- **2025-01-07**: Roboflow platform analysis:
  - **Private Dataset Creation**: $49-249/month for private models and datasets
  - **AI-Assisted Labeling**: Auto Label feature reduces manual annotation work
  - **Professional Labeling**: $0.05/bounding box for outsourced annotation
  - **Decision**: Roboflow is optimal choice for custom gym equipment detection model

---

*Last updated: January 7, 2025*
*Total exercises in database: 194*
*Core features operational: Exercise selection, pairing recommendations, workout timer*