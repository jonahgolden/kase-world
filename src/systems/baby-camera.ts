import { World } from 'koota';
import * as THREE from 'three';
import { IsCamera, IsPlayer, MovementMode, Transform } from '../traits';

// Third person camera position relative to baby
const CAMERA_OFFSET = {
	crawl: new THREE.Vector3(0, 1.2, 4), // Lower camera when crawling
	walk: new THREE.Vector3(0, 1.8, 4), // Higher camera when walking
};

export function babyThirdPersonCamera(world: World) {
	// Find the baby entity
	const baby = world.queryFirst(IsPlayer, Transform, MovementMode);
	if (!baby) return;

	const babyTransform = baby.get(Transform)!;
	const movementMode = baby.get(MovementMode)!;

	// Determine camera offset based on movement mode
	const offset = movementMode.mode === 'walk' ? CAMERA_OFFSET.walk : CAMERA_OFFSET.crawl;

	// Find the camera entity
	world.query(IsCamera, Transform).updateEach(([cameraTransform]) => {
		// Calculate camera position behind the baby
		const direction = new THREE.Vector3(0, 0, 1).applyEuler(babyTransform.rotation);
		const cameraPosition = babyTransform.position.clone().add(
			direction.multiplyScalar(offset.z) // Move behind the baby based on its orientation
		);

		// Add height offset based on movement mode
		cameraPosition.y += offset.y;

		// Update camera position
		cameraTransform.position.copy(cameraPosition);

		// Make the camera look at the baby
		const lookTarget = babyTransform.position.clone().add(new THREE.Vector3(0, 0.3, 0)); // Look at baby's head

		// Create a temporary matrix for the lookAt operation
		const lookMatrix = new THREE.Matrix4();
		lookMatrix.lookAt(cameraTransform.position, lookTarget, new THREE.Vector3(0, 1, 0));

		// Convert matrix to euler angles
		cameraTransform.rotation.setFromRotationMatrix(lookMatrix);
	});
}
