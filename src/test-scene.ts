import { World } from 'koota';
import * as THREE from 'three';
import { createPlatform } from './factories/test-objects';

export function setupTestScene(world: World) {
	// Create terrain pieces for collision testing
	// Main ground platform
	createPlatform(world, new THREE.Vector3(0, 0.125, 0), new THREE.Vector3(50, 0.25, 50));

	// createPlatform(world, new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 1, 2));

	// Walls for testing vertical collisions
	createPlatform(world, new THREE.Vector3(0, 2, -5), new THREE.Vector3(8, 4, 0.5)); // Front wall

	createPlatform(world, new THREE.Vector3(-20, 2, 0), new THREE.Vector3(0.5, 4, 8)); // Left wall

	createPlatform(world, new THREE.Vector3(-10, 2, 4), new THREE.Vector3(8, 4, 0.5)); // Back wall

	// Elevated platform for testing jumping/falling
	createPlatform(world, new THREE.Vector3(-3, 2, -4), new THREE.Vector3(6, 0.5, 6));
	// createGiantChickenNPC({
	// 	world,
	// 	position: new THREE.Vector3(-2, 4, 0),
	// 	rotation: new THREE.Euler(0, Math.PI / 3, 0), // Face center
	// });

	// // Ramp for testing angled collisions
	// createPlatform(world, new THREE.Vector3(-15, 2, 0), new THREE.Vector3(10, 0.5, 8)).get(
	// 	Transform
	// )!.rotation.z = Math.PI / 6; // 30-degree ramp

	// // Create entities in a semicircle for easy viewing
	// const radius = 10; // Distance from center
	// const centerPos = new THREE.Vector3(0, 0, 0);

	// // Giant Chicken at -60 degrees
	// createGiantChickenNPC({
	// 	world,
	// 	position: new THREE.Vector3(
	// 		centerPos.x + radius * Math.cos(-Math.PI / 3),
	// 		0,
	// 		centerPos.z + radius * Math.sin(-Math.PI / 3)
	// 	),
	// 	rotation: new THREE.Euler(0, Math.PI / 3, 0), // Face center
	// });

	// // Small Human at -30 degrees
	// createHumanNPC({
	// 	world,
	// 	position: new THREE.Vector3(
	// 		centerPos.x + radius * Math.cos(-Math.PI / 6),
	// 		0,
	// 		centerPos.z + radius * Math.sin(-Math.PI / 6)
	// 	),
	// 	rotation: new THREE.Euler(0, Math.PI / 6, 0), // Face center
	// 	size: 'small',
	// });

	// // Large Human at 0 degrees
	// createHumanNPC({
	// 	world,
	// 	position: new THREE.Vector3(centerPos.x + radius, 0, centerPos.z),
	// 	rotation: new THREE.Euler(0, 0, 0), // Face center
	// 	size: 'large',
	// });

	// // Centaur at 30 degrees
	// createCentaurNPC({
	// 	world,
	// 	position: new THREE.Vector3(
	// 		centerPos.x + radius * Math.cos(Math.PI / 6),
	// 		0,
	// 		centerPos.z + radius * Math.sin(Math.PI / 6)
	// 	),
	// 	rotation: new THREE.Euler(0, -Math.PI / 6, 0), // Face center
	// });

	// // Power-up floating at 60 degrees
	// createBasePowerUp({
	// 	world,
	// 	position: new THREE.Vector3(
	// 		centerPos.x + radius * Math.cos(Math.PI / 3),
	// 		2, // Float above ground
	// 		centerPos.z + radius * Math.sin(Math.PI / 3)
	// 	),
	// });

	// // Vehicle behind the semicircle
	// createBaseVehicle({
	// 	world,
	// 	position: new THREE.Vector3(0, 0, -radius),
	// 	rotation: new THREE.Euler(0, Math.PI, 0), // Face the semicircle
	// });

	// // Create a trigger zone with collision events
	// const trigger = createTriggerZone(world, new THREE.Vector3(0, 3, 0), new THREE.Vector3(4, 4, 4));

	// // Create callback sets for trigger events
	// const onEnterCallbacks = new Set<(other: Entity) => void>();
	// onEnterCallbacks.add((other: Entity) => {
	// 	console.log('Object entered trigger zone:', other.id());
	// });

	// const onExitCallbacks = new Set<(other: Entity) => void>();
	// onExitCallbacks.add((other: Entity) => {
	// 	console.log('Object left trigger zone:', other.id());
	// });

	// // Add collision events to the trigger
	// trigger.add(
	// 	CollisionEvents({
	// 		onTriggerEnter: onEnterCallbacks,
	// 		onTriggerExit: onExitCallbacks,
	// 		onTriggerStay: new Set(),
	// 		onCollisionEnter: new Set(),
	// 		onCollisionStay: new Set(),
	// 		onCollisionExit: new Set(),
	// 		contacts: new Set(),
	// 	})
	// );
}
