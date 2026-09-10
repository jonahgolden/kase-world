import { useActions, useWorld } from 'koota/react';
import { useEffect } from 'react';
import { Vector3 } from 'three';
import { actions } from './actions';
import { setupEnvironment } from './systems/environment-system';
// import { setupTestScene } from './test-scene'; // Disabled - using Rapier arena now

export function Startup({
	initialCameraPosition = [0, 1.5, 4], // Position camera behind and above the baby
}: {
	initialCameraPosition?: [number, number, number];
}) {
	const { spawnCamera, spawnPlayer, spawnDuogringo } = useActions(actions);
	const world = useWorld();

	useEffect(() => {
		// Set up the environment
		setupEnvironment(world);

		// setupTestScene(world); // Disabled - using Rapier arena now

		// Spawn camera for third-person view
		spawnCamera(initialCameraPosition);

		// Spawn main player
		const player = spawnPlayer();

		// Spawn Duogringo
		const duogringo = spawnDuogringo(new Vector3(0, 10, -5)); // Start 5 units in front of origin

		return () => {
			player.destroy();
			duogringo.destroy();
		};
	}, [spawnCamera, spawnPlayer, spawnDuogringo, initialCameraPosition, world]);

	return null;
}
