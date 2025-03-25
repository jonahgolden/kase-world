import { Entity, World } from 'koota';
import * as THREE from 'three';
import { PLAYER_BASE_THRUST, PLAYER_SPAWN_POSITION } from '../actions';
import {
	Collider,
	ColliderType,
	CollisionEvents,
	CollisionLayer,
	Health,
	Input,
	IsPlayer,
	Movement,
	MovementMode,
	Scream,
	Transform,
} from '../traits';
import { PhysicsBody } from '../traits/physics-body';

interface Props {
	world: World;
}

/**
 * Creates the Player entity
 */
export function createPlayerEntity({ world }: Props): Entity {
	return world.spawn(
		IsPlayer,
		Transform({
			position: PLAYER_SPAWN_POSITION,
			rotation: new THREE.Euler(0, 0, 0),
			scale: new THREE.Vector3(1, 1, 1),
		}),
		Movement({
			velocity: new THREE.Vector3(),
			thrust: PLAYER_BASE_THRUST,
			damping: 0.85, // More damping for a crawling baby
			force: new THREE.Vector3(),
		}),
		MovementMode(), // Add movement mode trait with default values
		Input(),
		Health({
			current: 100,
			max: 100,
			invulnerabilityTimer: 0,
			isDamaged: false,
		}),
		Scream(), // Add scream trait with default values
		Collider({
			type: ColliderType.CAPSULE,
			radius: 0.2, // Increased from 0.2 to better match baby's visuals
			height: 0.4, // Increased from 0.4 for better collision
			size: new THREE.Vector3(0.8, 1.0, 0.8), // Increased size for box collider (not used for capsule but required)
			offset: new THREE.Vector3(0, 0.4, 0), // Slightly higher offset
			layer: CollisionLayer.CHARACTER,
			mask: CollisionLayer.DEFAULT | CollisionLayer.TRIGGER | CollisionLayer.CHARACTER,
			friction: 0.3,
			restitution: 0.1,
			isTrigger: false,
		}),
		CollisionEvents(), // Add collision events for the baby
		PhysicsBody()
	);
}
