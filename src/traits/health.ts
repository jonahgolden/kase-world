import { trait } from 'koota';

/**
 * Health trait for tracking entity health
 * - current: current health value
 * - max: maximum health value
 * - invulnerabilityTimer: timer for invulnerability period after taking damage (in seconds)
 * - isDamaged: flag indicating if entity recently took damage (for visual feedback)
 */
export const Health = trait({
	current: 100, // Default current health
	max: 100, // Default maximum health
	invulnerabilityTimer: 0, // Timer for temporary invulnerability after damage
	isDamaged: false, // Flag for visual feedback when damaged
});
