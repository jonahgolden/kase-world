import { Entity, World } from 'koota';
import * as THREE from 'three';
import {
	CapsuleCollider,
	CollisionEvents,
	CollisionLayer,
	Health,
	Movement,
	Ref,
	Transform,
} from '../traits';
import { PhysicsBody } from '../traits/physics-body';

// Character colors
const DEFAULT_COLOR = '#9C27B0'; // Purple
const GIANT_CHICKEN_COLOR = '#FFE082'; // Yellow
const HUMAN_NPC_COLOR = '#90CAF9'; // Light Blue
const CENTAUR_NPC_COLOR = '#A1887F'; // Brown

export interface NPCProps {
	world: World;
	scaleFactor?: number;
	color?: string;
	position?: THREE.Vector3;
	rotation?: THREE.Euler;
	health?: number;
	maxHealth?: number;
	mass?: number;
	speed?: number;
}

/**
 * Creates a base NPC entity with common traits
 */
export function createBaseNPC({
	world,
	scaleFactor = 1,
	color = DEFAULT_COLOR,
	position = new THREE.Vector3(0, 0, 0),
	rotation = new THREE.Euler(0, 0, 0),
	health = 100,
	maxHealth = 100,
	mass = 1,
	speed = 5,
}: NPCProps): Entity {
	const entity = world.spawn(
		Transform({
			position: position.clone(),
			rotation: rotation.clone(),
			scale: new THREE.Vector3(1, 1, 1),
		}),
		Health({
			current: health,
			max: maxHealth,
			invulnerabilityTimer: 0,
			isDamaged: false,
		}),
		CapsuleCollider({
			radius: scaleFactor / 2,
			height: scaleFactor,
			layer: CollisionLayer.CHARACTER,
			mask: CollisionLayer.CHARACTER | CollisionLayer.TERRAIN,
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

	// Add mesh
	const geometry = new THREE.CapsuleGeometry(scaleFactor / 2, scaleFactor, 4, 8);
	const material = new THREE.MeshStandardMaterial({ color });
	const mesh = new THREE.Mesh(geometry, material);

	entity.add(Ref(mesh));

	return entity;
}

export function createGiantChicken(world: World, position: THREE.Vector3): Entity {
	return createBaseNPC({
		world,
		position,
		scaleFactor: 2,
		color: GIANT_CHICKEN_COLOR,
	});
}

export function createHumanNPC(world: World, position: THREE.Vector3, isLarge: boolean = false): Entity {
	const scale = isLarge ? 1.5 : 0.8;

	return createBaseNPC({
		world,
		position,
		scaleFactor: scale,
		color: HUMAN_NPC_COLOR,
	});
}
