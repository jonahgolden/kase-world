import { World } from 'koota';
import * as THREE from 'three';
import { Movement, PhysicsBody, Time, Transform } from '../traits';
import { Collider, CollisionEvents } from '../traits/collider';

// Physics constants
const GRAVITY = new THREE.Vector3(0, -9.8, 0);
const GROUND_LEVEL = 0; // For simple ground check

// Reusable vectors to avoid allocations
const tempVec3 = new THREE.Vector3();

export function physicsSystem(world: World) {
	// Get the delta time from the world clock
	const time = world.get(Time);
	if (!time) return;

	const delta = time.delta;
	const currentTime = time.current;

	// Process physics for all entities with Transform, Movement, and PhysicsBody
	world.query(Transform, Movement, PhysicsBody).forEach((entity) => {
		const transform = entity.get(Transform);
		const movement = entity.get(Movement);
		const physics = entity.get(PhysicsBody);

		if (!transform || !movement || !physics) return;

		// Skip static bodies
		if (physics.isStatic) return;

		// Store original values
		const originalState = {
			position: transform.position.clone(),
			velocity: movement.velocity.clone(),
		};

		// Apply accumulated forces
		if (!physics.isKinematic) {
			// Apply gravity if enabled
			if (physics.gravity) {
				tempVec3.copy(GRAVITY).multiplyScalar(physics.gravityScale * delta);
				movement.velocity.add(tempVec3);
			}

			// Apply accumulated forces (scaled by mass)
			const forces = physics.forces;
			tempVec3.copy(forces).divideScalar(physics.mass).multiplyScalar(delta);
			movement.velocity.add(tempVec3);

			// Reset forces after applying them
			forces.set(0, 0, 0);
		}

		// Apply drag (air resistance)
		const dragFactor = Math.pow(1 - physics.drag, delta * 60); // Scale drag by delta time
		movement.velocity.multiplyScalar(dragFactor);

		// Apply ground friction if grounded
		if (physics.isGrounded) {
			// Only apply friction to XZ plane (horizontal movement)
			const horizontalVelocity = new THREE.Vector3(movement.velocity.x, 0, movement.velocity.z);

			if (horizontalVelocity.lengthSq() > 0.001) {
				const frictionFactor = Math.pow(1 - physics.groundFriction, delta * 60);
				movement.velocity.x *= frictionFactor;
				movement.velocity.z *= frictionFactor;
			}
		}

		// Enforce velocity constraints
		if (physics.constraints.x) movement.velocity.x = 0;
		if (physics.constraints.y) movement.velocity.y = 0;
		if (physics.constraints.z) movement.velocity.z = 0;

		// Enforce terminal velocity
		if (movement.velocity.length() > physics.terminalVelocity) {
			movement.velocity.normalize().multiplyScalar(physics.terminalVelocity);
		}

		// Update position based on velocity
		tempVec3.copy(movement.velocity).multiplyScalar(delta);
		transform.position.add(tempVec3);

		// Simple ground check (temporary until collision system is fully integrated)
		const wasGrounded = physics.isGrounded;

		if (transform.position.y <= GROUND_LEVEL) {
			transform.position.y = GROUND_LEVEL;

			// If we were falling and hit the ground, apply bounce
			if (movement.velocity.y < 0) {
				// Reflect velocity with energy loss (restitution)
				movement.velocity.y = -movement.velocity.y * physics.restitution;

				// If bounce is too small, just stop
				if (Math.abs(movement.velocity.y) < 0.1) {
					movement.velocity.y = 0;
				}
			}

			physics.isGrounded = true;
			physics.lastGroundedTime = currentTime;
		} else {
			physics.isGrounded = false;
		}

		// Check for collision events
		if (entity.has(CollisionEvents) && entity.has(Collider)) {
			// This is where we'd handle collision responses
			// Currently handled by the main collision system
		}

		// Update entity traits if they changed
		if (!originalState.position.equals(transform.position)) {
			entity.set(Transform, transform);
		}

		if (!originalState.velocity.equals(movement.velocity)) {
			entity.set(Movement, movement);
		}

		entity.set(PhysicsBody, physics);
	});
}
