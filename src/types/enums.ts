/**
 * Type-safe enums for game states
 */

/**
 * Player movement modes
 */
export enum MovementModeType {
	CRAWL = 'crawl',
	WALK = 'walk',
}

/**
 * Player animation states
 */
export enum PlayerAnimationState {
	CRAWL_IDLE = 'crawl-idle',
	CRAWL = 'crawl',
	WALK_IDLE = 'walk-idle',
	WALK = 'walk',
}

/**
 * Duogringo AI states
 */
export enum DuogringoAIState {
	IDLE = 'Idle',
	WALK = 'Walk',
	CHASE = 'Chase',
	ATTACK = 'Attack',
}

/**
 * Helper to get player animation based on mode and movement
 */
export function getPlayerAnimation(mode: MovementModeType, isMoving: boolean): PlayerAnimationState {
	if (mode === MovementModeType.CRAWL) {
		return isMoving ? PlayerAnimationState.CRAWL : PlayerAnimationState.CRAWL_IDLE;
	} else {
		return isMoving ? PlayerAnimationState.WALK : PlayerAnimationState.WALK_IDLE;
	}
}
