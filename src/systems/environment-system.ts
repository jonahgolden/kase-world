import { World } from 'koota';
import * as THREE from 'three';
import { createBush, createRock, createTree } from '../factories/environment/nature-factory';
import { createTerrain } from '../factories/environment/terrain-factory';

// Flag to ensure we only create the environment once
let environmentCreated = false;

/**
 * Creates and sets up the game environment
 */
export function setupEnvironment(world: World) {
	if (environmentCreated) return;

	// Create main terrain
	createTerrain(world);

	// Create forest areas
	createForestArea(world, new THREE.Vector3(-50, 0, -50), 20);
	createForestArea(world, new THREE.Vector3(40, 0, -30), 15);

	// Create rock formations
	createRockFormations(world, new THREE.Vector3(-30, 0, 30), 10);
	createRockFormations(world, new THREE.Vector3(20, 0, 40), 8);

	createRockFormations(world, new THREE.Vector3(10, 0, -10), 4);

	// Add scattered bushes
	for (let i = 0; i < 50; i++) {
		const x = (Math.random() - 0.5) * 160; // Spread across terrain
		const z = (Math.random() - 0.5) * 160;
		createBush(world, new THREE.Vector3(x, 0, z), 0.8 + Math.random() * 0.4);
	}

	// Create a clear spawn area
	// (No objects in a radius around 0,0,0)

	environmentCreated = true;
}

/**
 * Creates a forest area with multiple trees
 */
function createForestArea(world: World, center: THREE.Vector3, count: number) {
	const SPAWN_RADIUS = 15;
	const MIN_DISTANCE = 3; // Minimum distance between trees

	const trees: THREE.Vector3[] = [];

	// Try to place trees
	for (let i = 0; i < count; i++) {
		let attempts = 0;
		let position: THREE.Vector3;
		let validPosition = false;

		// Try to find a valid position
		while (!validPosition && attempts < 10) {
			const angle = Math.random() * Math.PI * 2;
			const radius = Math.random() * SPAWN_RADIUS;
			position = new THREE.Vector3(
				center.x + Math.cos(angle) * radius,
				center.y,
				center.z + Math.sin(angle) * radius
			);

			// Check distance from other trees
			validPosition = true;
			for (const tree of trees) {
				if (position.distanceTo(tree) < MIN_DISTANCE) {
					validPosition = false;
					break;
				}
			}

			attempts++;
		}

		// If we found a valid position, create a tree
		if (validPosition) {
			const scale = 0.8 + Math.random() * 0.4;
			createTree(world, position!, scale);
			trees.push(position!);
		}
	}
}

/**
 * Creates a group of rock formations
 */
function createRockFormations(world: World, center: THREE.Vector3, count: number) {
	const SPAWN_RADIUS = 10;
	const MIN_DISTANCE = 2; // Minimum distance between rocks

	const rocks: THREE.Vector3[] = [];

	for (let i = 0; i < count; i++) {
		let attempts = 0;
		let position: THREE.Vector3;
		let validPosition = false;

		while (!validPosition && attempts < 10) {
			const angle = Math.random() * Math.PI * 2;
			const radius = Math.random() * SPAWN_RADIUS;
			position = new THREE.Vector3(
				center.x + Math.cos(angle) * radius,
				center.y,
				center.z + Math.sin(angle) * radius
			);

			validPosition = true;
			for (const rock of rocks) {
				if (position.distanceTo(rock) < MIN_DISTANCE) {
					validPosition = false;
					break;
				}
			}

			attempts++;
		}

		if (validPosition) {
			const scale = 0.8 + Math.random() * 1.2;
			createRock(world, position!, scale);
			rocks.push(position!);
		}
	}
}
