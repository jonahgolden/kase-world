import { Entity, World } from 'koota';
import * as THREE from 'three';
import {
	Collider,
	ColliderType,
	CollisionEventsWithDefaults,
	CollisionLayer,
	PhysicsBody,
	Ref,
	Transform,
} from '../traits';

const TERRAIN_COLOR = '#8BC34A';

/**
 * Creates a static platform/terrain piece
 */
export function createPlatform(
	world: World,
	position: THREE.Vector3,
	size: THREE.Vector3 = new THREE.Vector3(5, 0.5, 5),
	color: string = TERRAIN_COLOR
): Entity {
	const entity = world.spawn(
		Transform({
			position: position.clone(),
			rotation: new THREE.Euler(),
			scale: new THREE.Vector3(1, 1, 1),
		}),
		Collider({
			type: ColliderType.BOX,
			size: size.clone(),
			radius: 0,
			height: size.y,
			offset: new THREE.Vector3(),
			layer: CollisionLayer.TERRAIN,
			mask: CollisionLayer.ALL,
			isTrigger: false,
			friction: 0.5,
			restitution: 0.3,
		}),
		PhysicsBody({
			mass: 0,
			drag: 0,
			gravity: false,
			gravityScale: 0,
			isKinematic: false,
			isStatic: true,
			constraints: { x: true, y: true, z: true },
			terminalVelocity: 0,
			groundFriction: 0.8,
			restitution: 0.3,
			forces: new THREE.Vector3(),
			isGrounded: true,
			groundNormal: new THREE.Vector3(0, 1, 0),
			lastGroundedTime: 0,
		}),
		CollisionEventsWithDefaults({
			onCollisionEnter: new Set([() => material.color.set('#ff0000')]),
			onCollisionExit: new Set([() => material.color.set(color)]),
		})
	);

	// Add Mesh for platform
	const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
	const material = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.7 });
	const mesh = new THREE.Mesh(geometry, material);
	entity.add(Ref(mesh));

	return entity;
}
