import { useFrame } from '@react-three/fiber';
import { useActions, useWorld } from 'koota/react';
import { useEffect } from 'react';
import { Vector3 } from 'three';
import { actions } from './actions';
import { setupEnvironment } from './systems/environment-system';
import { updateSpatialHashing } from './systems/update-spatial-hashing';

export function Startup({
	initialCameraPosition = [0, 1.5, 4], // Position camera behind and above the baby
}: {
	initialCameraPosition?: [number, number, number];
}) {
	const { spawnCamera, spawnPlayer, spawnDuogringo, spawnDuogringoBuilding } = useActions(actions);
	const world = useWorld();

	useEffect(() => {
		// Set up the environment
		const environmentSetup = setupEnvironment(world);
		const getTerrainHeightAt = environmentSetup?.getTerrainHeightAt;

		// setupTestScene(world);

		// Spawn camera for third-person view
		spawnCamera(initialCameraPosition);

		// Spawn main player
		const player = spawnPlayer();

		// Spawn Duogringo circus tent 20 units from origin, at terrain ground level
		const tentX = 20;
		const tentZ = 0;
		const terrainHeight = getTerrainHeightAt ? getTerrainHeightAt(tentX, tentZ) : 0;
		const tentPosition = new Vector3(tentX, terrainHeight, tentZ);
		const tentParts = spawnDuogringoBuilding(tentPosition);

		// Spawn Duogringo inside the circus tent (center, on the tent floor)
		const duogringo = spawnDuogringo(new Vector3(tentPosition.x, tentPosition.y + 3, tentPosition.z)); // +2 for tent floor +1 for above floor

		return () => {
			player.destroy();
			duogringo.destroy();
			tentParts.forEach((part) => part.destroy());
		};
	}, [spawnCamera, spawnPlayer, spawnDuogringo, spawnDuogringoBuilding, initialCameraPosition, world]);

	useFrame(() => {
		updateSpatialHashing(world);
	});

	return null;
}
