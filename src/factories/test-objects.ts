import { Entity, World } from 'koota';
import * as THREE from 'three';
import { Movement, Transform } from '../traits';
import { Collider, ColliderType, CollisionLayer } from '../traits/collider';
import { PhysicsBody } from '../traits/physics-body';

/**
 * Creates a bouncing ball with physics and collision
 */
export function createBouncingBall(
	world: World,
	position: THREE.Vector3,
	radius: number = 0.5,
	color: string = '#ff0000'
): Entity {
	const ball = world.spawn(
		Transform({
			position: position.clone(),
			rotation: new THREE.Euler(),
			scale: new THREE.Vector3(1, 1, 1),
		}),
		Collider({
			type: ColliderType.SPHERE,
			radius,
			size: new THREE.Vector3(radius * 2, radius * 2, radius * 2),
			height: radius * 2,
			offset: new THREE.Vector3(),
			layer: CollisionLayer.CHARACTER,
			mask: CollisionLayer.TERRAIN | CollisionLayer.CHARACTER,
			isTrigger: false,
			friction: 0.5,
			restitution: 0.7,
		}),
		PhysicsBody({
			mass: 1,
			drag: 0.01,
			gravity: true,
			gravityScale: 1,
			isKinematic: false,
			isStatic: false,
			constraints: { x: false, y: false, z: false },
			terminalVelocity: 20,
			groundFriction: 0.1,
			restitution: 0.7,
			forces: new THREE.Vector3(),
			isGrounded: false,
			groundNormal: new THREE.Vector3(0, 1, 0),
			lastGroundedTime: 0,
		}),
		Movement({
			velocity: new THREE.Vector3(0, 5, 0),
			thrust: 0,
			damping: 0.1,
			force: new THREE.Vector3(),
		})
	);
	return ball;
}

/**
 * Creates a static platform/terrain piece
 */
export function createPlatform(
	world: World,
	position: THREE.Vector3,
	size: THREE.Vector3 = new THREE.Vector3(5, 0.5, 5)
): Entity {
	const platform = world.spawn(
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
			mask: CollisionLayer.CHARACTER,
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
		})
	);
	return platform;
}

/**
 * Creates a dynamic box that can be pushed around
 */
export function createDynamicBox(
	world: World,
	position: THREE.Vector3,
	size: THREE.Vector3 = new THREE.Vector3(1, 1, 1)
): Entity {
	const box = world.spawn(
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
			layer: CollisionLayer.CHARACTER,
			mask: CollisionLayer.TERRAIN | CollisionLayer.CHARACTER,
			isTrigger: false,
			friction: 0.5,
			restitution: 0.3,
		}),
		PhysicsBody({
			mass: 2,
			drag: 0.1,
			gravity: true,
			gravityScale: 1,
			isKinematic: false,
			isStatic: false,
			constraints: { x: false, y: false, z: false },
			terminalVelocity: 20,
			groundFriction: 0.8,
			restitution: 0.3,
			forces: new THREE.Vector3(),
			isGrounded: false,
			groundNormal: new THREE.Vector3(0, 1, 0),
			lastGroundedTime: 0,
		}),
		Movement({
			velocity: new THREE.Vector3(),
			thrust: 0,
			damping: 0.1,
			force: new THREE.Vector3(),
		})
	);
	return box;
}

/**
 * Creates a trigger volume that detects when objects enter/exit
 */
export function createTriggerZone(
	world: World,
	position: THREE.Vector3,
	size: THREE.Vector3 = new THREE.Vector3(2, 2, 2)
): Entity {
	const trigger = world.spawn(
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
			mask: CollisionLayer.CHARACTER,
			isTrigger: true,
			friction: 0,
			restitution: 0,
		})
	);
	return trigger;
}
