import { World } from 'koota';
import * as THREE from 'three';
import {
	Collider,
	COLLIDER_DEFAULTS,
	ColliderInstanceType,
	ColliderType,
	CollisionEvents,
	CollisionLayer,
	PHYSICS_BODY_DEFAULTS,
	PhysicsBody,
	Transform,
} from '../traits';
import { Ref } from '../traits/ref';

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
	// Create a new entity with collider
	const entity = world.spawn(
		Transform({ position }),
		Collider(collider),
		CollisionEvents(),
		PhysicsBody({ ...PHYSICS_BODY_DEFAULTS, isStatic: true })
	);

	// Add a mesh for visualization
	const geometry =
		collider.type === ColliderType.SPHERE
			? new THREE.SphereGeometry(collider.radius || 1)
			: new THREE.BoxGeometry(collider.size?.x || 1, collider.size?.y || 1, collider.size?.z || 1);

	const material = new THREE.MeshStandardMaterial({
		color,
		transparent: true,
		opacity: 0.7,
	});

	const mesh = new THREE.Mesh(geometry, material);
	entity.add(Ref(mesh));

	// Add collision event handlers that change the color
	const collisionEvents = entity.get(CollisionEvents);
	collisionEvents?.onCollisionEnter.add(() => {
		material.color.set('#ff0000'); // Red on collision
	});

	collisionEvents?.onCollisionExit.add(() => {
		material.color.set(color); // Reset color
	});

	return entity;
}

/**
 * Creates a simple collision demo scene
 */
export function collisionDemo(world: World) {
	// Only create the demo once
	if (demoCreated) return;

	// Create some test objects with colliders
	// Spheres
	addColliderObject({
		world,
		type: ColliderType.SPHERE,
		position: new THREE.Vector3(3, 1, 3),
		color: '#0088ff',
		radius: 0.5,
	});

	addColliderObject({
		world,
		type: ColliderType.SPHERE,
		position: new THREE.Vector3(-3, 1, 3),
		color: '#0088ff',
		radius: 0.5,
	});

	// Boxes
	addColliderObject({
		world,
		type: ColliderType.BOX,
		position: new THREE.Vector3(3, 3, -3),
		color: '#ff8800',
		size: new THREE.Vector3(1, 1, 1),
	});

	addColliderObject({
		world,
		type: ColliderType.BOX,
		position: new THREE.Vector3(-3, 1, -3),
		color: '#8800ff',
		size: new THREE.Vector3(1, 1, 1),
	});

	// Trigger box (doesn't block movement but detects collisions)
	addColliderObject({
		world,
		position: new THREE.Vector3(0, 0.5, 0),
		color: '#00ffff',
		type: ColliderType.BOX,
		isTrigger: true,
		layer: CollisionLayer.TRIGGER,
		mask: CollisionLayer.DEFAULT | CollisionLayer.CHARACTER,
		size: new THREE.Vector3(2, 1, 2),
	});

	// Set demo as created
	demoCreated = true;
}
