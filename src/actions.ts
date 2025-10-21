import { Entity, createActions } from 'koota';
import * as THREE from 'three';
import { createDuogringoSpawnBuilding } from './factories/building-factory';
import { createDuogringoEntity } from './factories/duogringo-factory';
import { createPlayerEntity } from './factories/player-factory';
import { CameraZoom, Health, IsCamera, Movement, Transform } from './traits';

// Define the invulnerability period in seconds
const INVULNERABILITY_PERIOD = 0.8;
const DAMAGE_KNOCKBACK_FORCE = -15;

// Player spawn position
export const PLAYER_SPAWN_POSITION = new THREE.Vector3(0, 10, 0);

// Player base thrust
export const PLAYER_BASE_THRUST = 7;

export const actions = createActions((world) => ({
	spawnCamera: (position: [number, number, number]) => {
		return world.spawn(Transform({ position: new THREE.Vector3(...position) }), IsCamera, CameraZoom());
	},
	spawnPlayer: () => createPlayerEntity({ world }),
	spawnDuogringo: (position?: THREE.Vector3) => createDuogringoEntity({ world, position }),
	spawnDuogringoBuilding: (position?: THREE.Vector3) => createDuogringoSpawnBuilding({ world, position }),

	// Apply damage to an entity with health
	applyDamage: (targetEntity: Entity, sourceEntity: Entity, amount: number) => {
		if (targetEntity && targetEntity.has(Health)) {
			const health = targetEntity.get(Health)!;

			// Only apply damage if not in invulnerability period
			if (health.invulnerabilityTimer <= 0) {
				targetEntity.set(Health, {
					...health,
					current: Math.max(0, health.current - amount),
					invulnerabilityTimer: INVULNERABILITY_PERIOD,
					isDamaged: true,
				});
				const damageDir = new THREE.Vector3()
					.subVectors(sourceEntity.get(Transform)!.position, targetEntity.get(Transform)!.position)
					.setY(0)
					.normalize();

				// Apply knockback if direction is provided and entity has Movement
				if (damageDir && targetEntity.has(Movement)) {
					const movement = targetEntity.get(Movement)!;
					const knockbackForce = damageDir.clone().multiplyScalar(DAMAGE_KNOCKBACK_FORCE * amount);
					movement.velocity.add(knockbackForce);
					targetEntity.set(Movement, movement);
				}
				return true;
			}
		}
		return false;
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
