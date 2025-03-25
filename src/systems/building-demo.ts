import { World } from 'koota';
import * as THREE from 'three';
import { createBuilding, createSimpleHouse, createTallBuilding } from '../factories/building-factory';

// Flag to ensure we only create the buildings once
let demoCreated = false;

/**
 * Creates a simple building demo scene with some sample buildings
 */
export function buildingDemo(world: World) {
	// Only create the demo once
	if (demoCreated) return;

	// Create a few buildings in different positions

	// Simple generic building
	createBuilding({
		world,
		position: new THREE.Vector3(10, 1.5, 10),
		rotation: new THREE.Euler(0, 0, 0), // No rotation
		size: new THREE.Vector3(4, 3, 4),
		color: '#555555',
	});

	// Some houses
	createSimpleHouse({
		world,
		position: new THREE.Vector3(15, 1.25, 5),
	});

	createSimpleHouse({
		world,
		position: new THREE.Vector3(20, 1.25, 8),
		rotation: new THREE.Euler(0, 0, 0), // No rotation
	});

	// A tall building
	createTallBuilding({
		world,
		position: new THREE.Vector3(12, 7.5, -10),
	});

	// Set demo as created
	demoCreated = true;
}
