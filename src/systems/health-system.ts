import { World } from 'koota';
import { Health, IsPlayer, Time } from '../traits';

// Configure game over callback
let gameOverCallback: (() => void) | null = null;

export function setGameOverCallback(callback: () => void) {
	gameOverCallback = callback;
}

export function healthSystem(world: World) {
	const time = world.get(Time);
	if (!time) return;

	world.query(Health).forEach((entity) => {
		const health = entity.get(Health);
		if (!health) return;

		// Create an update object to collect all changes
		const healthUpdates = { ...health };
		let hasUpdates = false;

		// Update invulnerability timer
		if (health.invulnerabilityTimer > 0) {
			healthUpdates.invulnerabilityTimer = Math.max(0, health.invulnerabilityTimer - time.delta);
			hasUpdates = true;

			// Reset timer when it goes below zero
			if (healthUpdates.invulnerabilityTimer <= 0) {
				healthUpdates.invulnerabilityTimer = 0;
				healthUpdates.isDamaged = false; // Reset damage visual indicator
			}
		}

		// Check for death condition
		if (health.current <= 0) {
			healthUpdates.current = 0; // Ensure health doesn't go below zero
			hasUpdates = true;

			// Check if this is the player or another entity
			if (entity.has(IsPlayer)) {
				// Player death - trigger game over
				if (gameOverCallback) {
					gameOverCallback();
				}
			} else {
				// Non-player entity death - destroy the entity
				console.log('Entity destroyed due to zero health:', entity.id());
				entity.destroy();
				return; // Skip further processing since entity is destroyed
			}
		}

		// Ensure health doesn't exceed maximum
		if (health.current > health.max) {
			healthUpdates.current = health.max;
			hasUpdates = true;
		}

		// Apply updates if any were made
		if (hasUpdates) {
			entity.set(Health, healthUpdates);
		}
	});
}
