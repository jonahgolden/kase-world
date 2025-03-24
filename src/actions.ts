import { Entity, createActions } from 'koota';
import * as THREE from 'three';
import {
	Collider,
	ColliderType,
	CollisionEvents,
	CollisionLayer,
	Health,
	Input,
	IsBaby,
	IsCamera,
	IsPlayer,
	Movement,
	MovementMode,
	Scream,
	Transform,
} from './traits';

// Define the invulnerability period in seconds
const INVULNERABILITY_PERIOD = 0.8;

// Baby spawn position
export const BABY_SPAWN_POSITION = new THREE.Vector3(0, 0, 0);

export const actions = createActions((world) => ({
	spawnPlayer: () => world.spawn(IsPlayer, Transform),
	spawnCamera: (position: [number, number, number]) => {
		return world.spawn(Transform({ position: new THREE.Vector3(...position) }), IsCamera);
	},
	spawnBaby: (initialPosition: THREE.Vector3 = BABY_SPAWN_POSITION) => {
		return world.spawn(
			IsBaby,
			IsPlayer,
			Transform({
				position: initialPosition,
				rotation: new THREE.Euler(0, 0, 0),
				scale: new THREE.Vector3(1, 1, 1),
			}),
			Movement({
				velocity: new THREE.Vector3(),
				thrust: 0.3, // Lower thrust for baby movement
				damping: 0.85, // More damping for a crawling baby
				force: new THREE.Vector3(),
			}),
			MovementMode(), // Add movement mode trait with default values
			Input(),
			Health({
				current: 100,
				max: 100,
				invulnerabilityTimer: 0,
				isDamaged: false,
			}),
			Scream(), // Add scream trait with default values
			Collider({
				type: ColliderType.CAPSULE,
				radius: 0.2, // Increased from 0.2 to better match baby's visuals
				height: 0.4, // Increased from 0.4 for better collision
				size: new THREE.Vector3(0.8, 1.0, 0.8), // Increased size for box collider (not used for capsule but required)
				offset: new THREE.Vector3(0, 0.4, 0), // Slightly higher offset
				layer: CollisionLayer.CHARACTER,
				mask: CollisionLayer.DEFAULT | CollisionLayer.TRIGGER | CollisionLayer.CHARACTER,
				friction: 0.3,
				restitution: 0.1,
				isTrigger: false,
			}),
			CollisionEvents() // Add collision events for the baby
		);
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
