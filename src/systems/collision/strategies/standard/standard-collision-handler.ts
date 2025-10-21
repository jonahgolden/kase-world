import { checkCollision as standardCheckCollision } from '../../checkers/check-collision';
import { CollisionCheckProps, CollisionHandler, CollisionResult } from '../types';

/**
 * Standard collision handler that uses our existing implementation
 * This is a wrapper around our current collision detection system
 */
export class StandardCollisionHandler implements CollisionHandler {
	checkCollision(props: CollisionCheckProps): CollisionResult | null {
		return standardCheckCollision(props);
	}

	// No initialization needed for standard implementation
	initialize(): void {}

	// No cleanup needed for standard implementation
	cleanup(): void {}

	// No per-frame updates needed for standard implementation
	update(): void {}

	// Debug visualization can be added later if needed
	debugDraw(): void {}
}

/**
 * Factory function to create a new StandardCollisionHandler
 */
export function createStandardCollisionHandler(): CollisionHandler {
	return new StandardCollisionHandler();
}
