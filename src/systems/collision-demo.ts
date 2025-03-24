import { World } from 'koota';
import * as THREE from 'three';
import { createPhysicsEntity, createPowerUpEntity, createVehicleEntity } from '../factory';
import { COLLIDER_DEFAULTS, ColliderInstanceType, ColliderType } from '../traits';

// Flag to ensure we only create the objects once
let demoCreated = false;

/**
 * Adds a simple object with a collider to the world
 */
function addColliderObject({
	world,
	position,
	color,
	...colliderProps
}: { world: World; position: THREE.Vector3; color: string } & Partial<ColliderInstanceType>) {
	const collider = { ...COLLIDER_DEFAULTS, ...colliderProps };

	// Create a physics entity using the factory with visual mesh
	return createPhysicsEntity(world, {
		position,
		colliderType: collider.type,
		colliderRadius: collider.radius,
		colliderHeight: collider.height,
		colliderSize: collider.size,
		colliderOffset: new THREE.Vector3(0, 0, 0),
		isTrigger: collider.isTrigger,
		// Make static so it doesn't fall
		isStatic: true,
		// Add visual properties
		color,
		opacity: 0.7,
		addVisualMesh: true,
	});
}

/**
 * Creates a simple collision demo scene
 */
export function collisionDemo(world: World) {
	// Only create the demo once
	if (demoCreated) return;

	// Create some test objects with colliders
	// Note: We position objects at Y = half their height to center them properly,
	// keeping colliderOffset at (0,0,0) for consistent visual representation

	// Spheres
	addColliderObject({
		world,
		type: ColliderType.SPHERE,
		position: new THREE.Vector3(3, 0.5, 3), // Half-height to center sphere
		color: '#0088ff',
		radius: 0.5,
	});

	addColliderObject({
		world,
		type: ColliderType.SPHERE,
		position: new THREE.Vector3(-3, 0.5, 3),
		color: '#0088ff',
		radius: 0.5,
	});

	// Boxes
	addColliderObject({
		world,
		type: ColliderType.BOX,
		position: new THREE.Vector3(3, 0.5, -3),
		color: '#ff8800',
		size: new THREE.Vector3(1, 1, 1),
	});

	addColliderObject({
		world,
		type: ColliderType.BOX,
		position: new THREE.Vector3(3, 1, -3),
		color: '#ff8800',
		size: new THREE.Vector3(1, 1, 1),
	});

	addColliderObject({
		world,
		type: ColliderType.BOX,
		position: new THREE.Vector3(-3, 0.5, -3),
		color: '#8800ff',
		size: new THREE.Vector3(1, 1, 1),
	});

	// Add a power-up entity using the factory
	createPowerUpEntity(world, {
		position: new THREE.Vector3(5, 0.5, 0),
		powerUpType: 'health',
		strength: 2.0,
	});

	// Add a vehicle entity using the factory
	createVehicleEntity(world, {
		position: new THREE.Vector3(-5, 0.5, 0),
		vehicleType: 'car',
	});

	// Set demo as created
	demoCreated = true;
}
