import { Entity, World } from 'koota';
import * as THREE from 'three';
import { Collider, ColliderType, CollisionEvents, CollisionLayer } from '../traits/collider';
import { Health } from '../traits/health';
import { Movement } from '../traits/movement';
import { PhysicsBody } from '../traits/physics-body';
import { Transform } from '../traits/transform';

export interface NPCProps {
	world: World;
	position?: THREE.Vector3;
	rotation?: THREE.Euler;
	scale?: THREE.Vector3;
	health?: number;
	maxHealth?: number;
	colliderSize?: THREE.Vector3;
	colliderOffset?: THREE.Vector3;
	mass?: number;
	speed?: number;
	damage?: number;
}

/**
 * Creates a base NPC entity with common traits
 */
export function createBaseNPC({
	world,
	position = new THREE.Vector3(),
	rotation = new THREE.Euler(),
	scale = new THREE.Vector3(1, 1, 1),
	health = 100,
	maxHealth = 100,
	colliderSize = new THREE.Vector3(1, 2, 1),
	colliderOffset = new THREE.Vector3(0, 1, 0),
	mass = 1,
	speed = 5,
	damage = 10,
}: NPCProps): Entity {
	return world.spawn(
		Transform({
			position: position.clone(),
			rotation: rotation.clone(),
			scale: scale.clone(),
		}),
		Health({
			current: health,
			max: maxHealth,
			invulnerabilityTimer: 0,
			isDamaged: false,
		}),
		Collider({
			type: ColliderType.CAPSULE,
			radius: colliderSize.x / 2,
			height: colliderSize.y,
			size: colliderSize.clone(),
			offset: colliderOffset.clone(),
			layer: CollisionLayer.CHARACTER,
			mask: CollisionLayer.CHARACTER | CollisionLayer.TERRAIN,
			isTrigger: false,
			friction: 0.3,
			restitution: 0.1,
		}),
		PhysicsBody({
			mass,
			drag: 0.1,
			gravity: true,
			gravityScale: 1,
			isKinematic: false,
			isStatic: false,
			constraints: { x: false, y: false, z: false },
			terminalVelocity: 20,
			groundFriction: 0.8,
			restitution: 0.1,
			forces: new THREE.Vector3(),
			isGrounded: false,
			groundNormal: new THREE.Vector3(0, 1, 0),
			lastGroundedTime: 0,
		}),
		Movement({
			velocity: new THREE.Vector3(),
			thrust: speed,
			damping: 0.1,
			force: new THREE.Vector3(),
		}),
		CollisionEvents()
	);
}
