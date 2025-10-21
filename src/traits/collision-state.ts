import { trait } from 'koota';

/**
 * Trait for managing collision state in the ECS.
 * Focuses on core collision tracking functionality.
 */
export interface CollisionStateType {
	// Current frame collision tracking
	currentCollisions: Map<number, Set<number>>;
}

/**
 * Trait for tracking collisions between entities.
 * Uses callback-based trait for complex Map object.
 */
export const CollisionState = trait(() => ({
	currentCollisions: new Map<number, Set<number>>(),
}));

/**
 * Helper functions for collision state management
 */
export const CollisionStateUtils = {
	/**
	 * Record a collision between two entities
	 */
	recordCollision: (state: CollisionStateType, entityA: number, entityB: number) => {
		if (!state.currentCollisions.has(entityA)) {
			state.currentCollisions.set(entityA, new Set());
		}
		if (!state.currentCollisions.has(entityB)) {
			state.currentCollisions.set(entityB, new Set());
		}
		state.currentCollisions.get(entityA)?.add(entityB);
		state.currentCollisions.get(entityB)?.add(entityA);
	},

	/**
	 * Check if two entities are currently colliding
	 */
	areColliding: (state: CollisionStateType, entityA: number, entityB: number): boolean => {
		return state.currentCollisions.get(entityA)?.has(entityB) || false;
	},

	/**
	 * Clear all collision records for the current frame
	 */
	clearCollisions: (state: CollisionStateType) => {
		state.currentCollisions.clear();
	},
};
