import { Entity, World } from 'koota';
import * as THREE from 'three';
import {
	CapsuleCollider,
	CollisionEvents,
	CollisionLayer,
	DUOGRINGO_BASE_SPEED,
	DuogringoAnimation,
	DuogringoPower,
	Health,
	IsDuogringo,
	Movement,
	SpatialTracking,
	Transform,
} from '../traits';
import { getPhysicsBody } from '../traits/physics-body';

interface Props {
	world: World;
	position?: THREE.Vector3;
}

/**
 * Creates the Duogringo entity with all necessary traits including health
 */
export function createDuogringoEntity({ world, position = new THREE.Vector3(0, 0, 0) }: Props): Entity {
	return world.spawn(
		IsDuogringo,
		Transform({
			position: position.clone(),
			rotation: new THREE.Euler(0, 0, 0),
			scale: new THREE.Vector3(1, 1, 1),
		}),
		Movement({
			velocity: new THREE.Vector3(),
			thrust: DUOGRINGO_BASE_SPEED, // Base movement speed
			damping: 0.85,
			force: new THREE.Vector3(),
		}),
		Health({
			current: 150, // Duogringo health as requested
			max: 150,
			invulnerabilityTimer: 0,
			isDamaged: false,
		}),
		DuogringoPower(),
		DuogringoAnimation(),
		// BoxCollider({
		// 	size: new THREE.Vector3(
		// 		DUOGRINGO_BASE_SCALE * 12,
		// 		DUOGRINGO_BASE_SCALE * 20,
		// 		DUOGRINGO_BASE_SCALE * 12
		// 	), // Adjust based on model size
		// 	offset: new THREE.Vector3(0, DUOGRINGO_BASE_SCALE * 10, 0), // Center vertically
		// 	layer: CollisionLayer.CHARACTER,
		// 	mask: CollisionLayer.ALL,
		// }),
		CapsuleCollider({
			radius: 0.3,
			height: 0.7,
			offset: new THREE.Vector3(0, 0.6, 0),
			layer: CollisionLayer.CHARACTER,
			mask: CollisionLayer.ALL,
		}),
		CollisionEvents(),
		getPhysicsBody({ mass: 2 }),
		SpatialTracking()
	);
}
