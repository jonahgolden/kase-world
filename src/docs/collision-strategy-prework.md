# Collision Strategy Pre-work

Before implementing new collision strategies (GJK and CANNON.js), we need to address several architectural issues to ensure a clean and reliable implementation.

## 1. Collider Trait Enhancement

### Current Issues

- Limited support for convex shapes (only Dodecahedron has vertices) [P1]
- No caching mechanism for transformed vertices [P2]
- Missing support for GJK-specific data [P1]
- No standardized way to get support points for shapes [P1]

### Required Changes

```typescript
// Add to ColliderInstanceType
interface ColliderInstanceType {
	// ... existing fields ...

	// New fields for transformed geometry caching [P2]
	transformedVertices?: THREE.Vector3[]; // Cached vertices in world space
	transformMatrix?: THREE.Matrix4; // Cached transform matrix

	// Convex hull data (for complex shapes) [P1]
	convexHull?: {
		vertices: THREE.Vector3[];
		faces: number[][];
	};

	// Support function for GJK [P1]
	supportPoint?: (direction: THREE.Vector3) => THREE.Vector3;
}
```

## 2. Collision Result Enhancement

### Current Issues

- Simple penetration + normal model may not be sufficient [P1]
- No support for multiple contact points [P2]
- Missing collision data that physics engines might provide [P1]
- No velocity information at contact points [P2]

### Required Changes

```typescript
interface CollisionResult {
	// Existing fields [P1]
	normal: THREE.Vector3;
	penetration: number;
	point?: THREE.Vector3;

	// New fields [P2]
	contacts?: Array<{
		point: THREE.Vector3;
		normal: THREE.Vector3;
		penetration: number;
		relativeVelocity?: THREE.Vector3;
	}>;

	// Additional data for physics integration [P1]
	impulse?: THREE.Vector3;
	frictionImpulse?: THREE.Vector3;
}
```

## 3. System Responsibility Separation

### Current Issues

- Overlapping resting state handling between physics and collision systems [P1]
- Inconsistent thresholds and constants [P1]
- Mixed responsibility for ground state and friction [P1]
- Potential for double-application of physics effects [P1]

### Required Changes

1. **Create Shared Constants**: [P1]

```typescript
// src/constants/physics.ts
export const PHYSICS = {
	RESTING: {
		VELOCITY_THRESHOLD: 0.1,
		BOUNCE_THRESHOLD: 0.2,
		GRAVITY_SCALE: 0.2,
	},
	GROUND: {
		NORMAL_THRESHOLD: 0.7, // ~45 degrees
		FRICTION: 0.3,
	},
	COLLISION: {
		CORRECTION_SCALE: 1.0,
		CORRECTION_FALLOFF: 0.5,
		MAX_ITERATIONS: 10,
	},
};
```

2. **Refactor Ground State Management**: [P1]

- Move all ground state logic to physics system
- Collision system only reports collision data
- Physics system interprets collision data for ground state

3. **Separate Velocity Updates**: [P1]

- Physics system owns all velocity changes
- Collision system provides impulse data
- Clear separation between immediate position corrections and velocity updates

## 4. Collision State Management

### Current Issues

- Global collision tracking using Map outside ECS [P1]
- No standardized way to track collision history [P3]
- Collision events tied to specific implementation [P2]
- Missing persistent collision state for debugging [P3]

### Required Changes

```typescript
// New trait for collision state management
export interface CollisionStateType {
	// Current frame collision tracking [P1]
	currentCollisions: Map<number, Set<number>>;

	// Collision history and timing [P3]
	lastCollisionTime: number;
	collisionHistory: Array<{
		entityA: number;
		entityB: number;
		result: CollisionResult;
		timestamp: number;
	}>;

	// Active contact points for debugging/visualization [P3]
	activeContacts: CollisionResult[];

	// Performance metrics [P2]
	averageCollisionChecks: number;
	peakCollisionChecks: number;
}
```

## 5. Broad-phase Optimization Strategy

### Current Issues

- Single spatial hash grid implementation [P2]
- No standardized broad-phase interface [P1]
- Potential duplicate broad-phase checks across strategies [P2]
- Missing performance comparison metrics [P3]

### Required Changes

```typescript
// Broad-phase strategy interface [P1]
export interface BroadPhaseStrategy {
	// Core functionality [P1]
	initialize(): void;
	update(entities: Entity[]): void;
	getPotentialPairs(): CollisionPair[];

	// Optional features [P3]
	getEntitiesInRegion?(min: THREE.Vector3, max: THREE.Vector3): Entity[];

	// Performance metrics [P2]
	getMetrics(): {
		updateTime: number;
		queryTime: number;
		memoryUsage: number;
	};
}
```

## 6. Implementation Order

1. **Phase 1: Foundation** (1-2 weeks) [P1]

   - Create shared physics constants [P1]
   - Implement CollisionState trait [P1]
   - Update existing systems to use CollisionState [P1]
   - Add performance monitoring hooks [P2]

2. **Phase 2: Data Structures** (1-2 weeks) [P1]

   - Enhance ColliderInstanceType [P1]
   - Update CollisionResult interface [P1]
   - Implement geometry caching [P2]
   - Add support point functions [P1]

3. **Phase 3: System Separation** (1-2 weeks) [P1]

   - Refactor ground state management [P1]
   - Separate velocity handling [P1]
   - Clean up system responsibilities [P1]
   - Update collision event handling [P2]

4. **Phase 4: Broad-phase Implementation** (2-3 weeks) [P2]

   - Create broad-phase strategy interface [P1]
   - Implement strategy-specific optimizations [P2]
   - Add performance comparison system [P3]
   - Migrate existing spatial hash grid [P2]

5. **Phase 5: Strategy Integration** (2-3 weeks) [P2]
   - Implement GJK strategy [P2]
   - Integrate CANNON.js [P2]
   - Add strategy switching mechanism [P1]
   - Finalize debug visualization [P3]

## 7. Testing Considerations

For each phase:

1. **Functionality Testing** [P1]

   - Existing collision cases still work [P1]
   - No regression in physics behavior [P1]
   - Ground detection and friction consistency [P1]
   - Collision response accuracy [P1]

2. **Performance Testing** [P2]

   - Monitor broad-phase optimization metrics [P2]
   - Compare strategy performance [P2]
   - Track memory usage for cached data [P3]
   - Measure collision resolution time [P2]

3. **State Management Testing** [P2]

   - Verify collision state consistency [P1]
   - Test event system reliability [P2]
   - Validate history tracking [P3]
   - Check debug visualization accuracy [P3]

4. **Integration Testing** [P1]
   - Strategy switching behavior [P1]
   - Cross-strategy collision handling [P1]
   - Physics engine integration [P1]
   - Multi-frame collision stability [P1]

## Next Steps

After completing these changes, we'll have:

- Clear separation of concerns between systems [P1]
- Enhanced data structures ready for GJK [P1]
- Consistent physics behavior [P1]
- Better foundation for multiple collision strategies [P1]
- Comprehensive performance monitoring [P2]
- Reliable state management [P2]
- Flexible broad-phase optimization [P2]

Would you like to proceed with implementing Phase 1?
