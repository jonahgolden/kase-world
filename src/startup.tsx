import { useFrame } from '@react-three/fiber';
import { useActions, useWorld } from 'koota/react';
import { useEffect } from 'react';
import { actions } from './actions';
import { buildingDemo } from './systems/building-demo';
import { updateSpatialHashing } from './systems/update-spatial-hashing';

export function Startup({
	initialCameraPosition = [0, 1.5, 4], // Position camera behind and above the baby
}: {
	initialCameraPosition?: [number, number, number];
}) {
	const { spawnCamera, spawnPlayer } = useActions(actions);
	const world = useWorld();

	useEffect(() => {
		// Spawn camera for third-person view
		spawnCamera(initialCameraPosition);

		// Spawn baby entity instead of regular player
		const player = spawnPlayer();

		// Initialize buildings
		buildingDemo(world);

		return () => {
			player.destroy();
		};
	}, [spawnCamera, spawnPlayer, initialCameraPosition, world]);

	useFrame(() => {
		updateSpatialHashing(world);
	});

	return null;
}
