/**
 * Centralized physics constants for consistent behavior across systems
 */
export const PHYSICS = {
	RESTING: {
		VELOCITY_THRESHOLD: 0.1, // Threshold for considering an object at rest
		BOUNCE_THRESHOLD: 0.2, // Minimum velocity for bounce response
		GRAVITY_SCALE: 0.2, // Reduced gravity scale for resting objects
	},
	GROUND: {
		NORMAL_THRESHOLD: 0.7, // ~45 degrees threshold for ground detection
		FRICTION: 0.3, // Base friction coefficient for ground contact
	},
	COLLISION: {
		CORRECTION_SCALE: 1.0, // Base scale for position correction
		CORRECTION_FALLOFF: 0.5, // How quickly correction reduces per iteration
		MAX_ITERATIONS: 10, // Maximum collision resolution iterations
		EXTRA_SEPARATION: 0.001, // Small separation to prevent sticking
	},
	TIME: {
		FIXED_TIMESTEP: 1 / 60, // Fixed physics timestep (60 Hz)
		MAX_ACCUMULATED: 0.2, // Maximum accumulated time to prevent spiral of death
	},
} as const;

// Type for accessing physics constants with type safety
export type PhysicsConstants = typeof PHYSICS;
