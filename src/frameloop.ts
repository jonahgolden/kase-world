import { useFrame } from '@react-three/fiber';
import { useWorld } from 'koota/react';
import { convertInputToMovement } from './systems/apply-input';
import { babyScreamSystem } from './systems/baby-scream';
import { collisionDemo } from './systems/collision-demo';
import { collisionSystem } from './systems/collision-system';
import { healthSystem } from './systems/health-system';
import { physicsSystem } from './systems/physics-system';
import { playerThirdPersonCamera } from './systems/player-camera';
import { playerMovementMode } from './systems/player-movement-mode';
import { pollInput } from './systems/poll-input';
import { syncView } from './systems/sync-view';
import { testDamageSystem } from './systems/test-damage-system';
import { updateSpatialHashing } from './systems/update-spatial-hashing';
import { updateTime } from './systems/update-time';

export function GameLoop() {
	const world = useWorld();

	// Initialize the collision demo once
	collisionDemo(world);

	useFrame(() => {
		// Start
		updateTime(world);

		// Input processing
		pollInput(world);
		testDamageSystem(world); // For testing damage (press 'T')

		// Update game state
		convertInputToMovement(world);
		playerMovementMode(world);
		// babyJump(world);
		// moveEntities(world);

		// Physics and movement - using our new unified physics system
		physicsSystem(world);

		// Spatial and collision systems
		updateSpatialHashing(world);
		collisionSystem(world);

		babyScreamSystem(world); // Process baby scream attack
		healthSystem(world); // Process health updates
		playerThirdPersonCamera(world);

		// Sync view state
		syncView(world);
	});

	return null;
}
