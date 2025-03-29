import { World } from 'koota';
import * as THREE from 'three';
import { CameraZoom, IsCamera, IsPlayer, MovementMode, Transform } from '../traits';

// Third person camera position relative to baby
const CAMERA_OFFSET = {
	crawl: new THREE.Vector3(0, 1.8, 1), // Higher and further back when crawling
	walk: new THREE.Vector3(0, 2.4, 1), // Higher and further back when walking
};

export function playerThirdPersonCamera(world: World) {
	// Find the player entity
	const player = world.queryFirst(IsPlayer, Transform, MovementMode);
	if (!player) return;

	const playerTransform = player.get(Transform)!;
	const movementMode = player.get(MovementMode)!;

	// Find the camera entity
	world.query(IsCamera, Transform, CameraZoom).updateEach(([cameraTransform, zoom]) => {
		// Determine camera offset based on movement mode
		const offset = movementMode.mode === 'walk' ? CAMERA_OFFSET.walk : CAMERA_OFFSET.crawl;

		// Calculate camera position behind the player
		const direction = new THREE.Vector3(0, 0, 1).applyEuler(playerTransform.rotation);
		const cameraPosition = playerTransform.position.clone().add(
			direction.multiplyScalar(offset.z * zoom.distance) // Move behind the player based on orientation and apply zoom to the z offset
		);

		// Add height offset based on movement mode and zoom level
		const heightScale = 1 + (zoom.distance - zoom.minDistance) * 0.3; // Increase height as we zoom out
		cameraPosition.y += offset.y * heightScale;

		// Update camera position
		cameraTransform.position.copy(cameraPosition);

		// Make the camera look at the player
		const lookTarget = playerTransform.position
			.clone()
			.add(new THREE.Vector3(0, 0.3, 0)) // Base head offset
			.add(new THREE.Vector3(0, offset.y * heightScale * 0.5, 0)); // Scale the upward offset with zoom too

		// Create a temporary matrix for the lookAt operation
		const lookMatrix = new THREE.Matrix4();
		lookMatrix.lookAt(cameraTransform.position, lookTarget, new THREE.Vector3(0, 1, 0));

		// Convert matrix to euler angles
		cameraTransform.rotation.setFromRotationMatrix(lookMatrix);
	});
}

// Handle zoom input
export function cameraZoomSystem(world: World) {
	// Get the wheel delta from the world state
	const wheelDelta = (world as any).wheelDelta || 0;
	if (wheelDelta === 0) return;

	// Update zoom for all cameras
	world.query(IsCamera, CameraZoom).updateEach(([zoom]) => {
		// Update zoom distance based on wheel delta
		zoom.distance = Math.max(
			zoom.minDistance,
			Math.min(zoom.maxDistance, zoom.distance - wheelDelta * zoom.zoomSpeed)
		);
	});
}
