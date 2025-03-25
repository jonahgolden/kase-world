import { Entity } from 'koota';
import * as THREE from 'three';
import { createBaseNPC, NPCProps } from './npc-factory';

interface ChickenNPCProps
	extends Omit<NPCProps, 'colliderSize' | 'colliderOffset' | 'mass' | 'speed' | 'health' | 'maxHealth'> {
	territory?: THREE.Box3;
}

/**
 * Creates a Giant Chicken NPC
 * Properties:
 * - 3x the baby's height
 * - Medium damage, short range attacks
 * - Faster than crawling, slower than walking
 * - Territorial behavior
 */
export function createGiantChickenNPC({
	world,
	position = new THREE.Vector3(),
	rotation = new THREE.Euler(),
	scale = new THREE.Vector3(3, 3, 3), // 3x baby size
	territory = new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 0, 10)),
}: ChickenNPCProps): Entity {
	// Giant chicken specific properties
	const chickenProps: NPCProps = {
		world,
		position,
		rotation,
		scale,
		health: 150,
		maxHealth: 150,
		colliderSize: new THREE.Vector3(1.5, 3, 1.5), // Larger collision box
		colliderOffset: new THREE.Vector3(0, 1.5, 0), // Centered vertically
		mass: 3, // Heavier than basic NPCs
		speed: 4, // Between crawling and walking speed
		damage: 15, // Medium damage
	};

	// Create the base NPC with chicken properties
	const chicken = createBaseNPC(chickenProps);

	// Add chicken-specific traits here when they're created
	// Example: chicken.add(ChickenBehavior({ territory }));

	return chicken;
}
