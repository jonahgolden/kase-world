import { Entity, World } from 'koota';
import * as THREE from 'three';
import {
	BoxCollider,
	CollisionEvents,
	CollisionLayer,
	DUOGRINGO_BASE_SCALE,
	DUOGRINGO_BASE_SPEED,
	DuogringoAnimation,
	DuogringoPower,
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
 * Creates the Duogringo entity with all necessary traits
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
		DuogringoPower(),
		DuogringoAnimation(),
		BoxCollider({
			size: new THREE.Vector3(
				DUOGRINGO_BASE_SCALE * 12,
				DUOGRINGO_BASE_SCALE * 20,
				DUOGRINGO_BASE_SCALE * 12
			), // Adjust based on model size
			offset: new THREE.Vector3(0, DUOGRINGO_BASE_SCALE * 10, 0), // Center vertically
			layer: CollisionLayer.CHARACTER,
			mask: CollisionLayer.ALL,
		}),
		// CapsuleCollider({
		// 	radius: 0.4,
		// 	height: 0.8,
		// 	offset: new THREE.Vector3(0, 0.8, 0),
		// 	layer: CollisionLayer.CHARACTER,
		// 	mask: CollisionLayer.ALL,
		// }),
		CollisionEvents(),
		getPhysicsBody({ mass: 2 }),
		SpatialTracking()
	);
}
