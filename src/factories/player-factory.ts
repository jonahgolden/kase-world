import { Entity, World } from 'koota';
import * as THREE from 'three';
import { PLAYER_SPAWN_POSITION } from '../actions';
import {
	Health,
	Input,
	IsPlayer,
	MovementMode,
	Scream,
	Transform,
} from '../traits';

interface Props {
	world: World;
}

/**
 * Creates the Player entity
 * Physics is handled by the PlayerPhysics Rapier component
 */
export function createPlayerEntity({ world }: Props): Entity {
	return world.spawn(
		IsPlayer,
		Transform({
			position: PLAYER_SPAWN_POSITION,
			rotation: new THREE.Euler(0, 0, 0),
			scale: new THREE.Vector3(1, 1, 1),
		}),
		MovementMode(), // Tracks crawl/walk state and timers
		Input(),
		Health({
			current: 100,
			max: 100,
			invulnerabilityTimer: 0,
			isDamaged: false,
		}),
		Scream()
	);
}
