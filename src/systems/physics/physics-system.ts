import { World } from 'koota';
import * as THREE from 'three';
import { PHYSICS } from '../../constants/physics';
import { Movement, PhysicsBody, Time, Transform } from '../../traits';
import { CollisionState } from '../../traits/collision-state';

// Reusable vectors to avoid garbage collection
const tempVec = new THREE.Vector3();
const tempGravity = new THREE.Vector3();

/**
 * Updates physics state for entities with PhysicsBody
 * Handles:
 * - Gravity and forces
 * - Ground state management
 * - Velocity updates
 * - Position integration
 */
export function physicsSystem(world: World) {
	const timeData = world.get(Time);
	if (!timeData) return;

	const time = Math.min(timeData.delta, PHYSICS.TIME.MAX_ACCUMULATED);
	const collisionState = world.get(CollisionState);

	// Process physics bodies
	world.query(PhysicsBody, Transform).forEach((entity) => {
		const physics = entity.get(PhysicsBody);
		const transform = entity.get(Transform);
		const movement = entity.get(Movement);

		if (!physics || !transform) return;

		// Reset forces
		physics.forces.set(0, 0, 0);

		// Apply gravity if enabled
		if (physics.gravity && !physics.isStatic) {
			const gravityScale = physics.isGrounded ? PHYSICS.RESTING.GRAVITY_SCALE : physics.gravityScale;
			tempGravity.set(0, -9.81 * gravityScale, 0);
			physics.forces.add(tempGravity);
		}

		// Update ground state
		if (!physics.isStatic && collisionState) {
			// Check if we're still in contact with ground
			const collisions = collisionState.currentCollisions.get(entity.id());
			const stillGrounded = collisions ? collisions.size > 0 : false;

			// Check if velocity is below resting threshold for ground state
			const isNearlyAtRest =
				!movement ||
				movement.velocity.lengthSq() <
					PHYSICS.RESTING.VELOCITY_THRESHOLD * PHYSICS.RESTING.VELOCITY_THRESHOLD;

			if (physics.isGrounded && (!stillGrounded || !isNearlyAtRest)) {
				// We've left the ground
				physics.isGrounded = false;
				physics.groundNormal.set(0, 1, 0);
			}

			// Store last grounded time for jump buffering etc.
			if (physics.isGrounded) {
				physics.lastGroundedTime = timeData.current;
			}
		}

		// Apply movement if present
		if (movement && !physics.isStatic) {
			// Apply forces
			tempVec.copy(physics.forces).multiplyScalar(time / physics.mass);
			movement.velocity.add(tempVec);

			// Apply drag
			movement.velocity.multiplyScalar(1 - physics.drag);

			// Apply ground friction
			if (physics.isGrounded) {
				const horizontalVel = tempVec.set(movement.velocity.x, 0, movement.velocity.z);

				if (horizontalVel.lengthSq() > PHYSICS.RESTING.VELOCITY_THRESHOLD) {
					const friction = physics.groundFriction * PHYSICS.GROUND.FRICTION;
					horizontalVel.multiplyScalar(1 - friction);
					movement.velocity.x = horizontalVel.x;
					movement.velocity.z = horizontalVel.z;
				} else {
					// Zero out horizontal velocity if below threshold
					movement.velocity.x = 0;
					movement.velocity.z = 0;
				}
			}

			// Enforce terminal velocity
			if (movement.velocity.lengthSq() > physics.terminalVelocity * physics.terminalVelocity) {
				movement.velocity.normalize().multiplyScalar(physics.terminalVelocity);
			}

			// Apply movement constraints
			if (physics.constraints.x) movement.velocity.x = 0;
			if (physics.constraints.y) movement.velocity.y = 0;
			if (physics.constraints.z) movement.velocity.z = 0;

			// Update position
			tempVec.copy(movement.velocity).multiplyScalar(time);
			transform.position.add(tempVec);

			// Update traits
			entity.set(Movement, movement);
		}

		// Update physics body
		entity.set(PhysicsBody, physics);
		entity.set(Transform, transform);
	});
}
