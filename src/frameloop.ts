import { useFrame } from '@react-three/fiber';
import { useWorld } from 'koota/react';
import { babyScreamSystem } from './systems/baby-scream';
import { duogringoSystem } from './systems/duogringo-system';
import { healthSystem } from './systems/health-system';
import { inputSystem } from './systems/input-system';
import { cameraZoomSystem, playerThirdPersonCamera } from './systems/player-camera';
import { playerMovementMode } from './systems/player-movement-mode';
import { pollInput } from './systems/poll-input';
import { syncView } from './systems/sync-view';
import { testDamageSystem } from './systems/test-damage-system';
import { updateTime } from './systems/update-time';
import { SystemPriority } from './traits';
import { shouldRunSystem } from './utils/system-scheduler';

const FPS = 60; // Set your desired FPS here
const FRAME_TIME = 1000 / FPS; // Time per frame in milliseconds

export function GameLoop() {
	const world = useWorld();
	let lastFrameTime = 0;

	useFrame(() => {
		const currentTime = performance.now();
		const timeSinceLastFrame = currentTime - lastFrameTime;

		// Only update if enough time has passed since the last frame
		if (timeSinceLastFrame >= FRAME_TIME) {
			lastFrameTime = currentTime - (timeSinceLastFrame % FRAME_TIME); // Adjust for drift

			// CRITICAL PRIORITY - Run every frame
			// These systems are essential for game feel and responsiveness
			updateTime(world);
			inputSystem(world);
			pollInput(world);
			// convertInputToMovement removed - player movement now handled by PlayerPhysics Rapier component
			playerThirdPersonCamera(world);
			cameraZoomSystem(world);
			duogringoSystem(world);

			// HIGH PRIORITY - Run at ~30fps
			// These systems affect gameplay but can run at lower frequency
			if (shouldRunSystem(world, 'playerMovementMode', SystemPriority.HIGH)) {
				playerMovementMode(world);
			}

			// MEDIUM PRIORITY - Run at ~15fps
			// These systems are important but not time-critical
			if (shouldRunSystem(world, 'babyScream', SystemPriority.MEDIUM)) {
				babyScreamSystem(world, 15);
			}
			if (shouldRunSystem(world, 'health', SystemPriority.MEDIUM)) {
				healthSystem(world);
			}

			// LOW PRIORITY - Run at ~7.5fps
			// These systems are for testing or non-critical updates
			if (shouldRunSystem(world, 'testDamage', SystemPriority.LOW)) {
				testDamageSystem(world);
			}

			// View sync should run every frame to prevent visual stuttering
			syncView(world);
		}
	});

	return null;
}
