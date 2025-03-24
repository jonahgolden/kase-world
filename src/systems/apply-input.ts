import { World } from 'koota';
import * as THREE from 'three';
import { Input, Movement, MovementMode, PhysicsBody, Time, Transform } from '../traits';

const MOUSE_SENSITIVITY = 0.002; // Reduced sensitivity for baby movement

// Jump settings based on movement mode
const JUMP_FORCE = {
	crawl: 10, // Lower jump force when crawling
	walk: 12, // Higher jump force when walking
};

// Simple state object to track if the space was pressed in the previous frame
let wasJumpPressed = false;

/**
 * convertInputToMovement:
 * Applies mouse input for camera control and keyboard input for baby movement
 * Now uses the PhysicsBody system for force-based movement
 */
export function convertInputToMovement(world: World) {
	const time = world.get(Time);
	if (!time) return;

	world.query(Input, Transform, Movement, PhysicsBody).forEach((entity) => {
		const input = entity.get(Input);
		const transform = entity.get(Transform);
		const movement = entity.get(Movement);
		const physics = entity.get(PhysicsBody);
		const movementMode = entity.get(MovementMode);

		if (!input || !transform || !movement || !physics) return;

		// Get the current movement mode
		const mode = movementMode?.mode || 'crawl';

		// Mouse controls baby rotation (yaw only)
		transform.rotation.y -= input.mouseDelta.x * MOUSE_SENSITIVITY;
		entity.set(Transform, transform);

		// Get the baby's forward and right directions
		const forwardDir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, transform.rotation.y, 0));
		const rightDir = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, transform.rotation.y, 0));

		// Calculate the force to apply based on input
		// Only apply horizontal movement forces if on the ground
		const forceMultiplier = movement.thrust * 10; // Higher value for force-based movement
		const moveForce = new THREE.Vector3();

		// Forward movement (W key)
		if (input.forward > 0) {
			moveForce.addScaledVector(forwardDir, input.forward * forceMultiplier);
		}

		// Strafe movement (A/D keys)
		if (input.strafe !== 0) {
			moveForce.addScaledVector(rightDir, input.strafe * forceMultiplier);
		}

		// Only apply movement forces if we have any input or if entity is on the ground
		if (moveForce.lengthSq() > 0.001 && physics.isGrounded) {
			physics.forces.add(moveForce);
			entity.set(PhysicsBody, physics);
		}

		// Handle jumping - apply immediate velocity change on jump press
		const jumpPressed = input.jump && !wasJumpPressed;

		if (jumpPressed && physics.isGrounded) {
			// Apply upward force based on movement mode
			const jumpForce = mode === 'walk' ? JUMP_FORCE.walk : JUMP_FORCE.crawl;
			movement.velocity.y = jumpForce; // Direct velocity change for consistent jumping
			entity.set(Movement, movement);
		}

		// Braking (S key) - apply opposite force to current velocity
		if (input.brake) {
			const currentVelXZ = new THREE.Vector3(movement.velocity.x, 0, movement.velocity.z);

			// Only brake if we have horizontal velocity and are on the ground
			if (currentVelXZ.lengthSq() > 0.001 && physics.isGrounded) {
				const brakeForce = currentVelXZ
					.clone()
					.normalize()
					.multiplyScalar(-forceMultiplier * 0.8);
				physics.forces.add(brakeForce);
				entity.set(PhysicsBody, physics);
			}
		}
	});

	// Update jump button state for next frame
	wasJumpPressed = world.query(Input).some((entity) => entity.get(Input)?.jump || false);
}
