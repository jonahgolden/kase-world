import { World } from 'koota';
import * as THREE from 'three';
import { Input, Movement, Time, Transform } from '../traits';

const MOUSE_SENSITIVITY = 0.002; // Reduced sensitivity for baby movement

/**
 * convertInputToMovement:
 * Applies mouse input for camera control and keyboard input for baby movement
 */
export function convertInputToMovement(world: World) {
	const { delta } = world.get(Time)!;

	world.query(Input, Transform, Movement).updateEach(([input, transform, movement]) => {
		const { velocity, thrust } = movement;

		// Mouse controls baby rotation (yaw only)
		transform.rotation.y -= input.mouseDelta.x * MOUSE_SENSITIVITY;

		// Get the baby's forward and right directions
		const forwardDir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, transform.rotation.y, 0));
		const rightDir = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, transform.rotation.y, 0));

		// Apply thrust in the direction of movement
		const thrustForce = thrust * delta * 100;

		// Forward movement (W key)
		if (input.forward > 0) {
			velocity.addScaledVector(forwardDir, input.forward * thrustForce);
		}

		// Strafe movement (A/D keys)
		if (input.strafe !== 0) {
			velocity.addScaledVector(rightDir, input.strafe * thrustForce);
		}

		// Braking (S key)
		if (input.brake) {
			velocity.multiplyScalar(0.8); // Strong braking
		}
	});
}
