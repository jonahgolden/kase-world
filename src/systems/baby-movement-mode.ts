import { World } from 'koota';
import { BABY_THRUST } from '../actions';
import { Input, IsPlayer, Movement, MovementMode, Time } from '../traits';

/**
 * Handles the baby's movement mode (crawl/walk)
 * - Toggles between crawling and walking modes
 * - Manages walk duration and cooldown timers
 * - Adjusts movement speed based on mode
 */
export function babyMovementMode(world: World) {
	const time = world.get(Time);
	if (!time) return;

	world.query(IsPlayer, Input, Movement, MovementMode).updateEach(([input, movement, movementMode]) => {
		// Update timers based on current mode
		if (movementMode.mode === 'walk') {
			// When walking, increase walk duration
			movementMode.walkDuration += time.delta;

			// If exceeded max walk duration, switch to crawling and start cooldown
			if (movementMode.walkDuration >= movementMode.maxWalkDuration) {
				movementMode.mode = 'crawl';
				movementMode.walkDuration = 0;
				movementMode.walkCooldown = movementMode.totalWalkCooldown;
				movementMode.canWalk = false;
			}
		} else if (movementMode.walkCooldown > 0) {
			// Update cooldown timer when in crawl mode
			movementMode.walkCooldown -= time.delta;

			// Reset cooldown and allow walking once timer reaches zero
			if (movementMode.walkCooldown <= 0) {
				movementMode.walkCooldown = 0;
				movementMode.canWalk = true;
			}
		}

		// Toggle between movement modes when shift is pressed
		if (input.walk && movementMode.canWalk && movementMode.mode === 'crawl') {
			movementMode.mode = 'walk';
		} else if (!input.walk && movementMode.mode === 'walk') {
			movementMode.mode = 'crawl';
			// Reset walk duration but don't trigger cooldown when voluntarily stopping
			movementMode.walkDuration = 0;
		}

		// Adjust movement speed based on current mode
		const mode = movementMode.mode;
		const speedMultiplier = movementMode.speeds[mode];
		movement.thrust = BABY_THRUST * speedMultiplier; // Base thrust multiplied by mode-specific multiplier
	});
}
