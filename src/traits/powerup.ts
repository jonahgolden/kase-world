import { trait } from 'koota';

/**
 * Tag trait for identifying power-up entities
 */
export const IsPowerUp = trait();

/**
 * Power-up types
 */
export type PowerUpType = 'health' | 'speed' | 'damage' | 'invulnerability';

/**
 * Trait for tracking power-up properties
 */
export const PowerUp = trait({
	type: 'health' as PowerUpType,
	duration: 5.0,
	strength: 1.0,
	isCollected: false,
	collectedBy: null as number | null, // Entity ID of the collector, if any
});
