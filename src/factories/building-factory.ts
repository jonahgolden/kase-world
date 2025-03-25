import { Entity, World } from 'koota';
import * as THREE from 'three';
import {
	Collider,
	ColliderType,
	CollisionEvents,
	CollisionLayer,
	PHYSICS_BODY_DEFAULTS,
	PhysicsBody,
	Transform,
} from '../traits';
import { Ref } from '../traits/ref';

// Building properties interface
interface BuildingProps {
	world: World;
	position?: THREE.Vector3;
	rotation?: THREE.Euler;
	size?: THREE.Vector3;
	color?: string;
}

/**
 * Creates a building entity in the world
 * Buildings are static terrain objects with box colliders
 */
export function createBuilding({
	world,
	position = new THREE.Vector3(),
	rotation = new THREE.Euler(),
	size = new THREE.Vector3(5, 3, 5), // Default size for buildings
	color = '#888888', // Default gray color
}: BuildingProps): Entity {
	// Create building entity with required traits
	const entity = world.spawn(
		Transform({ position, rotation }),
		Collider({
			type: ColliderType.BOX,
			size,
			layer: CollisionLayer.TERRAIN, // Buildings use TERRAIN layer
			mask: 0xffffffff, // Collide with everything
			isTrigger: false, // Real physical collision
			radius: 0.5, // Default radius (not used for BOX but required)
			height: 0, // Default height (not used for BOX but required)
			offset: new THREE.Vector3(0, 0, 0), // No offset
			friction: 0.3, // Default friction
			restitution: 0, // Low bounciness
		}),
		CollisionEvents(), // Add collision events
		PhysicsBody({ ...PHYSICS_BODY_DEFAULTS, isStatic: true }) // Buildings are static and immovable
	);

	// Create mesh for visualization
	const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
	const material = new THREE.MeshStandardMaterial({
		color,
		roughness: 0.7,
		metalness: 0.2,
	});

	const mesh = new THREE.Mesh(geometry, material);
	entity.add(Ref(mesh));

	return entity;
}

/**
 * Creates a simple house at the specified position
 */
export function createSimpleHouse({
	world,
	position = new THREE.Vector3(),
	rotation = new THREE.Euler(),
}: Omit<BuildingProps, 'size' | 'color'>): Entity {
	return createBuilding({
		world,
		position,
		rotation,
		size: new THREE.Vector3(4, 2.5, 4),
		color: '#a86032', // Brown color for house
	});
}

/**
 * Creates a tall building at the specified position
 */
export function createTallBuilding({
	world,
	position = new THREE.Vector3(),
	rotation = new THREE.Euler(),
}: Omit<BuildingProps, 'size' | 'color'>): Entity {
	return createBuilding({
		world,
		position,
		rotation,
		size: new THREE.Vector3(6, 15, 6),
		color: '#3f4c69', // Blue-gray color
	});
}
