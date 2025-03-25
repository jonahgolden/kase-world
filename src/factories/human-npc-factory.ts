import { Entity } from 'koota';
import * as THREE from 'three';
import { createBaseNPC, NPCProps } from './npc-factory';

export type HumanSize = 'small' | 'large';

interface HumanNPCProps
	extends Omit<NPCProps, 'colliderSize' | 'colliderOffset' | 'mass' | 'speed' | 'health' | 'maxHealth'> {
	size: HumanSize;
	patrolArea?: THREE.Box3;
}

// Configuration for different human sizes
const humanConfigs: Record<
	HumanSize,
	{
		scale: THREE.Vector3;
		health: number;
		colliderSize: THREE.Vector3;
		colliderOffset: THREE.Vector3;
		mass: number;
		speed: number;
		damage: number;
	}
> = {
	small: {
		scale: new THREE.Vector3(2, 2, 2), // 2x baby size
		health: 100,
		colliderSize: new THREE.Vector3(1, 2, 1),
		colliderOffset: new THREE.Vector3(0, 1, 0),
		mass: 2,
		speed: 6, // Fast and agile
		damage: 10, // Low damage
	},
	large: {
		scale: new THREE.Vector3(4, 4, 4), // 4x baby size
		health: 200,
		colliderSize: new THREE.Vector3(2, 4, 2),
		colliderOffset: new THREE.Vector3(0, 2, 0),
		mass: 5,
		speed: 3, // Slow but powerful
		damage: 25, // High damage
	},
};

/**
 * Creates a Human NPC of specified size
 * Properties:
 * - Small humans: 2x baby size, fast but weak
 * - Large humans: 4x baby size, slow but strong
 * - Both types patrol designated areas
 */
export function createHumanNPC({
	world,
	position = new THREE.Vector3(),
	rotation = new THREE.Euler(),
	size = 'small',
	patrolArea = new THREE.Box3(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 0, 5)),
}: HumanNPCProps): Entity {
	const config = humanConfigs[size];

	// Human specific properties
	const humanProps: NPCProps = {
		world,
		position,
		rotation,
		scale: config.scale,
		health: config.health,
		maxHealth: config.health,
		colliderSize: config.colliderSize,
		colliderOffset: config.colliderOffset,
		mass: config.mass,
		speed: config.speed,
		damage: config.damage,
	};

	// Create the base NPC with human properties
	const human = createBaseNPC(humanProps);

	// Add human-specific traits here when they're created
	// Example: human.add(HumanBehavior({ size, patrolArea }));

	return human;
}
