import { Entity, World } from 'koota';
import * as THREE from 'three';
import { Collider, ColliderType, CollisionEvents, CollisionLayer } from '../traits/collider';
import { Movement } from '../traits/movement';
import { PhysicsBody } from '../traits/physics-body';
import { Transform } from '../traits/transform';

export interface VehicleProps {
	world: World;
	position?: THREE.Vector3;
	rotation?: THREE.Euler;
	scale?: THREE.Vector3;
	colliderSize?: THREE.Vector3;
	colliderOffset?: THREE.Vector3;
	mass?: number;
	maxSpeed?: number;
	acceleration?: number;
	turnRadius?: number;
}

/**
 * Creates a base vehicle entity with common traits
 * Properties:
 * - Physics-based movement
 * - Collision detection
 * - Entry/exit points
 * - State management (empty, occupied, disabled)
 */
export function createBaseVehicle({
	world,
	position = new THREE.Vector3(),
	rotation = new THREE.Euler(),
	scale = new THREE.Vector3(1, 1, 1),
	colliderSize = new THREE.Vector3(2, 1.5, 4), // Default car-like dimensions
	colliderOffset = new THREE.Vector3(0, 0.75, 0),
	mass = 1000,
	maxSpeed = 15,
	acceleration = 20,
	turnRadius = Math.PI / 4, // 45 degrees
}: VehicleProps): Entity {
	return world.spawn(
		Transform({
			position: position.clone(),
			rotation: rotation.clone(),
			scale: scale.clone(),
		}),
		Collider({
			type: ColliderType.BOX,
			size: colliderSize.clone(),
			radius: 0,
			height: colliderSize.y,
			offset: colliderOffset.clone(),
			layer: CollisionLayer.VEHICLE,
			mask: CollisionLayer.CHARACTER | CollisionLayer.TERRAIN | CollisionLayer.VEHICLE,
			isTrigger: false,
			friction: 0.5,
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
			terminalVelocity: maxSpeed,
			groundFriction: 0.8,
			restitution: 0.1,
			forces: new THREE.Vector3(),
			isGrounded: false,
			groundNormal: new THREE.Vector3(0, 1, 0),
			lastGroundedTime: 0,
		}),
		Movement({
			velocity: new THREE.Vector3(),
			thrust: acceleration,
			damping: 0.05, // Less damping for vehicles
			force: new THREE.Vector3(),
		}),
		CollisionEvents()
	);
}
