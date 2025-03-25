import { Entity, World } from 'koota';
import * as THREE from 'three';
import { Collider, ColliderType, CollisionEvents, CollisionLayer } from '../traits/collider';
import { Health } from '../traits/health';
import { Transform } from '../traits/transform';

export interface PowerUpProps {
	world: World;
	position?: THREE.Vector3;
	rotation?: THREE.Euler;
	scale?: THREE.Vector3;
	activationHealth?: number; // Health needed to be depleted for activation
	respawnDelay?: number; // Time in seconds before respawning
}

/**
 * Creates a base power-up entity with common traits
 * Properties:
 * - Floats in place
 * - Can be affected by baby's scream
 * - Requires multiple hits to activate
 * - Visual feedback for activation progress
 */
export function createBasePowerUp({
	world,
	position = new THREE.Vector3(),
	rotation = new THREE.Euler(),
	scale = new THREE.Vector3(1, 1, 1),
	activationHealth = 100,
	respawnDelay = 30,
}: PowerUpProps): Entity {
	return world.spawn(
		Transform({
			position: position.clone(),
			rotation: rotation.clone(),
			scale: scale.clone(),
		}),
		Health({
			current: activationHealth,
			max: activationHealth,
			invulnerabilityTimer: 0,
			isDamaged: false,
		}),
		Collider({
			type: ColliderType.SPHERE,
			radius: 0.5,
			size: new THREE.Vector3(1, 1, 1),
			height: 1,
			offset: new THREE.Vector3(0, 0.5, 0),
			layer: CollisionLayer.POWERUP,
			mask: CollisionLayer.CHARACTER,
			isTrigger: true,
			friction: 0,
			restitution: 0,
		}),
		CollisionEvents()
	);
}
