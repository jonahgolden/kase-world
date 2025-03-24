import { trait } from 'koota';

export type MovementModeType = 'crawl' | 'walk';

/**
 * MovementMode trait for tracking the movement state of an entity
 * - mode: 'crawl' or 'walk'
 * - walkDuration: current duration of walking (max 7 seconds)
 * - walkCooldown: cooldown until walking is available again (10 seconds)
 * - maxWalkDuration: maximum time allowed to walk
 * - totalWalkCooldown: total cooldown time before walking is available again
 */
export const MovementMode = trait({
	mode: 'crawl' as MovementModeType, // Default mode is crawling
	walkDuration: 0, // Current duration of walking
	walkCooldown: 0, // Cooldown until walking is available again
	maxWalkDuration: 7, // Maximum walk duration in seconds
	totalWalkCooldown: 10, // Cooldown time in seconds

	// Speed multipliers for each mode
	speeds: {
		crawl: 2.0, // Base speed (crawling)
		walk: 4.0, // Walking is 2x faster
	} as Record<MovementModeType, number>,

	// Flag to track if walk mode is available
	canWalk: true,
});
