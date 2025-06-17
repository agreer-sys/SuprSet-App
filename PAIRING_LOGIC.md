# SuprSet Pairing Logic Reference

## Current Implementation: Dual Mode System

### Standard Mode (Algorithmic Scoring)
**Scoring System:** 0-100 points, shows top 10 recommendations

**Criteria & Weights:**
1. **Pairing Compatibility Tags** (40 pts) - Highest priority from Airtable field
2. **Anchor Type Flow** (35 pts) - Anchored → Mobile preferred, Mobile → Anchored acceptable
3. **Exercise Type Opposition** (30 pts) - Push/Pull antagonist pairing
4. **Equipment Zone Efficiency** (25 pts) - Same zone minimizes setup time
5. **Setup Time Optimization** (20 pts) - Complex → Simple transition preferred
6. **Best Paired With Tags** (15 pts) - Trainer recommendations from Airtable
7. **Primary Muscle Differentiation** (10 pts) - Different muscles for active recovery
8. **Difficulty Level Matching** (5 pts) - Similar intensity levels

**Special Rules:**
- Deltoid/Shoulder exclusion: No deltoid exercise pairs with another deltoid exercise
- Self-pairing prevention: Exercise A ≠ Exercise B

### Trainer Mode (Strict Binary Filtering)
**System:** Pass/Fail criteria, only shows exercises meeting ALL requirements

**Mandatory Rules:**
1. **Anchor Flow:** If A is Anchored, B MUST be Mobile
2. **Setup Time:** B must have Low or Medium setup time
3. **Equipment Zone:** Must be same zone OR involve Floor (Floor compatible with all)
4. **Best Paired With:** B's field must include A's primary muscle or function
5. **No Self-Pairing:** A ≠ B
6. **No Deltoid Conflicts:** No deltoid-deltoid pairings

**Scoring:** Binary 0-2 scale, display only score 2 (perfect matches)

## Key Training Principles

### Physiological Rationale
- **Antagonist Pairing:** Allows active recovery while maintaining intensity
- **Equipment Efficiency:** Minimizes transition time and gym flow disruption
- **Deltoid Complexity:** Anterior/posterior deltoids span push/pull, creating fatigue conflicts
- **Anchor-Mobile Flow:** Natural movement progression from stable to dynamic

### Critical Assumptions to Challenge

**Assumption:** "Anchored must go to Mobile"
- **Counter:** Some anchored-anchored work well (cable station exercises)
- **Challenge:** Does this eliminate valid same-station supersets?

**Assumption:** "Best Paired With must include A's primary muscle"
- **Counter:** Great pairings often use complementary systems
- **Example:** Bench Press + Row (chest/back) vs. requiring "chest" in row's pairing field

**Assumption:** "Floor is compatible with everything"
- **Counter:** Floor to overhead press might be awkward
- **Challenge:** Are there Floor exercise exceptions?

**Assumption:** "Same difficulty levels are optimal"
- **Counter:** Progressive overload might benefit from A (hard) → B (easier)
- **Perspective:** Fatigue management vs. consistent intensity

## Implementation Status

### ✅ Completed
- Dual scoring systems
- Deltoid exclusion logic
- Equipment zone scoring
- Anchor type preferences
- Setup time optimization

### 🔄 In Progress
- Trainer Mode toggle UI
- Strict binary filtering
- Floor exercise special handling

### 💭 Future Considerations
- Time-based pairing (rest periods)
- Progression tracking influence
- User preference learning
- Gym layout optimization
- Peak/off-peak equipment availability

## Development Notes
- Standard Mode encourages exploration and variety
- Trainer Mode enforces proven methodologies
- System allows evolution as training philosophy develops
- User feedback will inform future refinements

*Last Updated: [Current Date]*
*Version: 1.0*