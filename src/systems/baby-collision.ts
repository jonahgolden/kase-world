import { World } from 'koota';
import * as THREE from 'three';
import { IsBaby, Movement, Transform } from '../traits';

// Baby collision parameters
const MIN_FLOOR_Y = 0.5; // Minimum height from the floor (matches GROUND_LEVEL in baby-jump.ts)

export function babyCollision(world: World) {
	world.query(IsBaby, Transform, Movement).forEach((entity) => {
		const transform = entity.get(Transform);
		const movement = entity.get(Movement);

		if (!transform || !movement) return;

		// Track if we need to update the traits
		let transformUpdated = false;
		let movementUpdated = false;
		const transformUpdate = { ...transform };
		const movementUpdate = { ...movement };

		// Prevent going below the floor (but don't interfere with jumping)
		if (transform.position.y < MIN_FLOOR_Y && movement.velocity.y <= 0) {
			transformUpdate.position.y = MIN_FLOOR_Y;
			transformUpdated = true;

			movementUpdate.velocity.y = 0; // Stop vertical movement when hitting the floor
			movementUpdated = true;
		}

		// Simple boundary to keep the baby within a reasonable area
		// This could be replaced with more sophisticated collision detection later
		const MAX_BOUNDARY = 24; // Half-size of the playable area

		const clampedX = THREE.MathUtils.clamp(transform.position.x, -MAX_BOUNDARY, MAX_BOUNDARY);
		if (clampedX !== transform.position.x) {
			transformUpdate.position.x = clampedX;
			transformUpdated = true;
		}

		const clampedZ = THREE.MathUtils.clamp(transform.position.z, -MAX_BOUNDARY, MAX_BOUNDARY);
		if (clampedZ !== transform.position.z) {
			transformUpdate.position.z = clampedZ;
			transformUpdated = true;
		}

		// Apply updates if needed
		if (transformUpdated) {
			entity.set(Transform, transformUpdate);
		}

		if (movementUpdated) {
			entity.set(Movement, movementUpdate);
		}

		// Here you would add more collision detection with other objects
		// For now, we're just implementing basic boundaries
	});
}
