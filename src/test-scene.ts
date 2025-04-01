import { World } from 'koota';
import * as THREE from 'three';
import { createPlatform } from './factories/environment/platform-factory';
import { createGiantChicken, createHumanNPC } from './factories/npc-factory';
import { createPowerUp, PowerUpType } from './factories/power-up-factory';
import { createVehicle, VehicleType } from './factories/vehicle-factory';
import { Transform } from './traits';

let created = false;

export function setupTestScene(world: World) {
	if (created) return;
	// Create terrain pieces for collision testing
	// Main ground platform
	createPlatform(world, new THREE.Vector3(0, -0.125, 0), new THREE.Vector3(50, 0.25, 50));

	// Walls for testing vertical collisions
	createPlatform(world, new THREE.Vector3(0, 2, -5), new THREE.Vector3(8, 4, 0.5)); // Front wall

	createPlatform(world, new THREE.Vector3(-20, 2, 0), new THREE.Vector3(0.5, 4, 8)); // Left wall

	createPlatform(world, new THREE.Vector3(-10, 2, 4), new THREE.Vector3(8, 4, 0.5)); // Back wall

	// Elevated platform for testing jumping/falling
	createPlatform(world, new THREE.Vector3(-3, 3, -4), new THREE.Vector3(6, 0.5, 6));

	// Ramp for testing angled collisions
	createPlatform(world, new THREE.Vector3(-15, 2, 0), new THREE.Vector3(10, 0.5, 8)).get(
		Transform
	)!.rotation.z = Math.PI / 6; // 30-degree ramp

	// Add NPCs
	createGiantChicken(world, new THREE.Vector3(5, 3, 5));
	createHumanNPC(world, new THREE.Vector3(-3, 1, 5), 'baby');
	createHumanNPC(world, new THREE.Vector3(-5, 5, 5), 'adult'); // Large human
	createHumanNPC(world, new THREE.Vector3(-7, 1, 5), 'child'); // Small human

	// Add power-ups
	createPowerUp(world, new THREE.Vector3(3, 1, -3), PowerUpType.HEALTH);
	createPowerUp(world, new THREE.Vector3(5, 1, -3), PowerUpType.SPEED);
	createPowerUp(world, new THREE.Vector3(7, 1, -3), PowerUpType.STRENGTH);

	// Add vehicles
	createVehicle(world, new THREE.Vector3(-5, 1, -5), VehicleType.TRICYCLE);
	createVehicle(world, new THREE.Vector3(-8, 1, -5), VehicleType.WAGON);
	createVehicle(world, new THREE.Vector3(-11, 1, -5), VehicleType.TOY_CAR);

	created = true;
}
