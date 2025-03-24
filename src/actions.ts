import { Entity, createActions } from 'koota';
import * as THREE from 'three';
import { createCameraEntity, createPlayerEntity } from './factory';
import { Health } from './traits';

// Define the invulnerability period in seconds
const INVULNERABILITY_PERIOD = 0.8;

// Baby spawn position
export const PLAYER_SPAWN_POSITION = new THREE.Vector3(0, 0, 0);

// Baby movement properties
export const BABY_THRUST = 5.0;

export const actions = createActions((world) => ({
	spawnPlayer: (initialPosition: THREE.Vector3 = PLAYER_SPAWN_POSITION) => {
		return createPlayerEntity(world, {
			position: initialPosition,
			thrust: BABY_THRUST,
		});
	},
	spawnCamera: (position: [number, number, number]) => {
		return createCameraEntity(world, {
			position: new THREE.Vector3(...position),
		});
	},

	// Apply damage to an entity with health
	applyDamage: (entity: Entity, amount: number) => {
		if (entity && entity.has(Health)) {
			const health = entity.get(Health)!;

			// Only apply damage if not in invulnerability period
			if (health.invulnerabilityTimer <= 0) {
				entity.set(Health, {
					...health,
					current: Math.max(0, health.current - amount),
					invulnerabilityTimer: INVULNERABILITY_PERIOD,
					isDamaged: true,
				});

				// Play damage sound effect or other feedback could be triggered here
			}
		}
	},

	// Heal an entity with health
	applyHealing: (entity: Entity, amount: number) => {
		if (entity && entity.has(Health)) {
			const health = entity.get(Health)!;
			const oldHealth = health.current;

			// Add health up to the maximum
			const newHealth = Math.min(health.current + amount, health.max);

			// Update the health using entity.set
			entity.set(Health, {
				...health,
				current: newHealth,
			});

			// Return the amount of health actually added
			return newHealth - oldHealth;
		}
		return 0;
	},
}));
