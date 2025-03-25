import { Entity } from 'koota';
import * as THREE from 'three';
import { createBaseNPC, NPCProps } from './npc-factory';

interface CentaurNPCProps
	extends Omit<NPCProps, 'colliderSize' | 'colliderOffset' | 'mass' | 'speed' | 'health' | 'maxHealth'> {
	territory?: THREE.Box3;
}

/**
 * Creates a Centaur NPC
 * Properties:
 * - 3.5x the baby's height
 * - High health and damage
 * - Fast movement with tactical behavior
 * - Large patrol territory
 */
export function createCentaurNPC({
	world,
	position = new THREE.Vector3(),
	rotation = new THREE.Euler(),
	scale = new THREE.Vector3(3.5, 3.5, 3.5), // 3.5x baby size
	territory = new THREE.Box3(
		new THREE.Vector3(-20, 0, -20), // Larger territory than other NPCs
		new THREE.Vector3(20, 0, 20)
	),
}: CentaurNPCProps): Entity {
	// Centaur specific properties
	const centaurProps: NPCProps = {
		world,
		position,
		rotation,
		scale,
		health: 300, // Higher health than other NPCs
		maxHealth: 300,
		colliderSize: new THREE.Vector3(2, 3.5, 4), // Longer body for horse part
		colliderOffset: new THREE.Vector3(0, 1.75, 0), // Adjusted for height
		mass: 6, // Heavier than humans
		speed: 8, // Faster than other NPCs
		damage: 30, // High damage
	};

	// Create the base NPC with centaur properties
	const centaur = createBaseNPC(centaurProps);

	// Add centaur-specific traits here when they're created
	// Example: centaur.add(CentaurBehavior({ territory }));

	return centaur;
}
