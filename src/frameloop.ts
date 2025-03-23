import { useFrame } from '@react-three/fiber';
import { useWorld } from 'koota/react';
import { convertInputToMovement } from './systems/apply-input';
import { babyThirdPersonCamera } from './systems/baby-camera';
import { babyCollision } from './systems/baby-collision';
import { babyJump } from './systems/baby-jump';
import { babyMovementMode } from './systems/baby-movement-mode';
import { babyScreamSystem } from './systems/baby-scream';
import { healthSystem } from './systems/health-system';
import { moveEntities } from './systems/move-entities';
import { pollInput } from './systems/poll-input';
import { syncView } from './systems/sync-view';
import { testDamageSystem } from './systems/test-damage-system';
import { updateTime } from './systems/update-time';

export function GameLoop() {
	const world = useWorld();

	useFrame(() => {
		// Start
		updateTime(world);

		// Input processing
		pollInput(world);
		testDamageSystem(world); // For testing damage (press 'T')

		// Update game state
		convertInputToMovement(world);
		babyMovementMode(world);
		babyJump(world);
		moveEntities(world);
		babyCollision(world);
		babyScreamSystem(world); // Process baby scream attack
		healthSystem(world); // Process health updates
		babyThirdPersonCamera(world);

		// Sync view state
		syncView(world);
	});

	return null;
}
