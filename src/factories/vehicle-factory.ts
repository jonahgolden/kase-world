import { Entity, World } from 'koota';
import * as THREE from 'three';
import {
	BoxCollider,
	CollisionEvents,
	CollisionLayer,
	Movement,
	Ref,
	Transform,
} from '../traits';
import { PhysicsBody } from '../traits/physics-body';

// Vehicle colors
const TRICYCLE_COLOR = '#E91E63'; // Pink
const WAGON_COLOR = '#795548'; // Brown
const TOY_CAR_COLOR = '#FF9800'; // Orange

export enum VehicleType {
	TRICYCLE,
	WAGON,
	TOY_CAR,
}

interface VehicleConfig {
	size: THREE.Vector3;
	mass: number;
	thrust: number;
	color: string;
}

const VEHICLE_CONFIGS: Record<VehicleType, VehicleConfig> = {
	[VehicleType.TRICYCLE]: {
		size: new THREE.Vector3(1, 1, 1.5),
		mass: 5,
		thrust: 8,
		color: TRICYCLE_COLOR,
	},
	[VehicleType.WAGON]: {
		size: new THREE.Vector3(2, 1, 3),
		mass: 8,
		thrust: 6,
		color: WAGON_COLOR,
	},
	[VehicleType.TOY_CAR]: {
		size: new THREE.Vector3(1.5, 1, 2),
		mass: 6,
		thrust: 10,
		color: TOY_CAR_COLOR,
	},
};

export function createVehicle(world: World, position: THREE.Vector3, type: VehicleType): Entity {
	const config = VEHICLE_CONFIGS[type];
	const entity = world.spawn(
		Transform({
			position: position.clone(),
			rotation: new THREE.Euler(),
			scale: new THREE.Vector3(1, 1, 1),
		}),
		Movement({
			velocity: new THREE.Vector3(),
			thrust: config.thrust,
			damping: 0.7,
			force: new THREE.Vector3(),
		}),
		BoxCollider({
			size: config.size.clone(),
			layer: CollisionLayer.VEHICLE,
			mask: CollisionLayer.ALL,
		}),
		CollisionEvents(),
		PhysicsBody({
			mass: config.mass,
			drag: 0.1,
			gravity: true,
			gravityScale: 1,
			isKinematic: false,
			isStatic: false,
			constraints: { x: false, y: false, z: false },
			terminalVelocity: 20,
			groundFriction: 0.8,
			forces: new THREE.Vector3(),
			isGrounded: false,
			groundNormal: new THREE.Vector3(0, 1, 0),
			lastGroundedTime: 0,
		})
	);

	// Add mesh
	const geometry = new THREE.BoxGeometry(config.size.x, config.size.y, config.size.z);
	const material = new THREE.MeshStandardMaterial({
		color: config.color,
		metalness: 0.6,
		roughness: 0.4,
	});
	const mesh = new THREE.Mesh(geometry, material);
	mesh.position.y = config.size.y / 2; // Match collider offset
	entity.add(Ref(mesh));

	return entity;
}
