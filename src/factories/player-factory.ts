import { Entity, World } from 'koota';
import * as THREE from 'three';
import { PLAYER_BASE_THRUST, PLAYER_SPAWN_POSITION } from '../actions';
import { PLAYER_SCALE } from '../components/player-renderer';
import {
	BoxCollider,
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
			damping: 0.85, // More damping for a player
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
		BoxCollider({
			size: new THREE.Vector3(PLAYER_SCALE, 0.7, PLAYER_SCALE),
			offset: new THREE.Vector3(0, PLAYER_SCALE, 0),
			layer: CollisionLayer.CHARACTER,
			mask: CollisionLayer.ALL,
		}),
		// CapsuleCollider({
		// 	radius: PLAYER_SCALE / 2,
		// 	height: PLAYER_SCALE,
		// 	offset: new THREE.Vector3(0, PLAYER_SCALE, 0),
		// 	layer: CollisionLayer.CHARACTER,
		// 	mask: CollisionLayer.ALL,
		// }),
		CollisionEvents(), // Add collision events for the player
		PhysicsBody()
	);
}
