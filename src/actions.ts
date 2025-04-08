import { Entity, createActions } from 'koota';
import * as THREE from 'three';
import { createDuogringoEntity } from './factories/duogringo-factory';
import { createPlayerEntity } from './factories/player-factory';
import { CameraZoom, Health, IsCamera, Transform } from './traits';

// Define the invulnerability period in seconds
const INVULNERABILITY_PERIOD = 0.6;

// Player spawn position
export const PLAYER_SPAWN_POSITION = new THREE.Vector3(0, 10, 0);

// Player base thrust
export const PLAYER_BASE_THRUST = 3;

export const actions = createActions((world) => ({
	spawnCamera: (position: [number, number, number]) => {
		return world.spawn(Transform({ position: new THREE.Vector3(...position) }), IsCamera, CameraZoom());
	},
	spawnPlayer: () => createPlayerEntity({ world }),
	spawnDuogringo: (position?: THREE.Vector3) => createDuogringoEntity({ world, position }),

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
