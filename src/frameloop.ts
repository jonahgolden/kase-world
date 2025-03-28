import { useFrame } from '@react-three/fiber';
import { useWorld } from 'koota/react';
import { convertInputToMovement } from './systems/apply-input';
import { babyScreamSystem } from './systems/baby-scream';
import { collisionSystem } from './systems/collision/collision-system';
import { healthSystem } from './systems/health-system';
import { physicsSystem } from './systems/physics-system';
import { playerThirdPersonCamera } from './systems/player-camera';
import { playerMovementMode } from './systems/player-movement-mode';
import { pollInput } from './systems/poll-input';
import { syncView } from './systems/sync-view';
import { testDamageSystem } from './systems/test-damage-system';
import { updateSpatialHashing } from './systems/update-spatial-hashing';
import { updateTime } from './systems/update-time';
import { setupTestScene } from './test-scene';

const FPS = 60; // Set your desired FPS here
const FRAME_TIME = 1000 / FPS; // Time per frame in milliseconds

export function GameLoop() {
	const world = useWorld();
	let lastFrameTime = 0;

	setupTestScene(world);

	useFrame(() => {
		const currentTime = performance.now();
		const timeSinceLastFrame = currentTime - lastFrameTime;

		// Only update if enough time has passed since the last frame
		if (timeSinceLastFrame >= FRAME_TIME) {
			lastFrameTime = currentTime - (timeSinceLastFrame % FRAME_TIME); // Adjust for drift

			// Start
			updateTime(world);

			// Input processing
			pollInput(world);
			testDamageSystem(world); // For testing damage (press 'T')

			// Update game state
			convertInputToMovement(world);
			playerMovementMode(world);

			// Physics and movement - using our unified physics system
			// Now includes collision detection and resolution
			physicsSystem(world);
			collisionSystem(world);

			// Spatial hashing for broad-phase collision detection
			updateSpatialHashing(world);

			babyScreamSystem(world); // Process baby scream attack
			healthSystem(world); // Process health updates
			playerThirdPersonCamera(world);

			// Sync view state
			syncView(world);
		}
	});

	return null;
}
