import { World } from 'koota';
import { Health, IsPlayer } from '../traits';

// Track if 'T' key is currently pressed
let isTestDamageKeyPressed = false;

// Set up key event listeners for testing damage
if (typeof window !== 'undefined') {
	window.addEventListener('keydown', (e) => {
		if (e.key === 't' || e.key === 'T') {
			isTestDamageKeyPressed = true;
		}
	});

	window.addEventListener('keyup', (e) => {
		if (e.key === 't' || e.key === 'T') {
			isTestDamageKeyPressed = false;
		}
	});
}

// Used for testing only - applies damage when 'T' key is pressed
export function testDamageSystem(world: World) {
	// Only allow damage once per key press
	if (isTestDamageKeyPressed) {
		isTestDamageKeyPressed = false; // Reset to prevent continuous damage

		// Find player entity
		const player = world.queryFirst(IsPlayer, Health);
		if (player) {
			const health = player.get(Health);
			if (health && health.invulnerabilityTimer <= 0) {
				const healthUpdates = { ...health };

				// Apply 20 damage directly
				healthUpdates.current -= 20;
				healthUpdates.invulnerabilityTimer = 0.8; // Match the INVULNERABILITY_PERIOD from actions.ts
				healthUpdates.isDamaged = true;

				player.set(Health, healthUpdates);
				console.log('Test damage applied to player: Current health:', healthUpdates.current);
			}
		}
	}
}
