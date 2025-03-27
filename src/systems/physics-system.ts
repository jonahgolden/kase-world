import { World } from 'koota';
import * as THREE from 'three';
import { Movement, Time, Transform } from '../traits';
import { PhysicsBody } from '../traits/physics-body';

// Physics constants
const GRAVITY = new THREE.Vector3(0, -9.8, 0);
const MINIMUM_HORIZONTAL_VELOCITY = 0.01; // Minimum horizontal velocity before velocity goes to 0.  Anything above this is considered moving and friction is applied
const RESTING_THRESHOLD = 0.1; // Velocity threshold for considering an object at rest
const RESTING_GRAVITY_SCALE = 0.2; // Reduced gravity scale when object is nearly at rest

// Reusable vectors to avoid allocations
const tempVec3 = new THREE.Vector3();

export function physicsSystem(world: World) {
	// Get the delta time from the world clock
	const time = world.get(Time);
	if (!time) return;

	const delta = time.delta;

	// Step 1: Update all entities with physics
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
			// Check if object is nearly at rest
			const isNearlyAtRest = Math.abs(movement.velocity.y) < RESTING_THRESHOLD && physics.isGrounded;

			// Apply gravity if enabled, with reduced scale when nearly at rest
			if (physics.gravity) {
				const gravityScale = isNearlyAtRest ? RESTING_GRAVITY_SCALE : physics.gravityScale;
				tempVec3.copy(GRAVITY).multiplyScalar(gravityScale * delta);
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

		// Apply ground friction
		const horizontalVelocity = new THREE.Vector3(movement.velocity.x, 0, movement.velocity.z);
		if (horizontalVelocity.lengthSq() < MINIMUM_HORIZONTAL_VELOCITY) {
			// Stop horizontal movement
			movement.velocity.x = 0;
			movement.velocity.z = 0;
		} else {
			// Apply friction
			const frictionFactor = Math.pow(1 - physics.groundFriction, delta * 60);
			movement.velocity.x *= frictionFactor;
			movement.velocity.z *= frictionFactor;
		}

		// Enforce velocity constraints
		if (physics.constraints.x) movement.velocity.x = 0;
		if (physics.constraints.y) movement.velocity.y = 0;
		if (physics.constraints.z) movement.velocity.z = 0;

		// Enforce terminal velocity
		if (movement.velocity.length() > physics.terminalVelocity) {
			movement.velocity.normalize().multiplyScalar(physics.terminalVelocity);
		}

		// Calculate proposed new position based on velocity
		const newPosition = transform.position.clone();
		tempVec3.copy(movement.velocity).multiplyScalar(delta);
		newPosition.add(tempVec3);

		// Update position
		transform.position.copy(newPosition);

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
