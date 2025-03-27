import { trait } from 'koota';

export enum PowerUpType {
	HEALTH,
	SPEED,
	STRENGTH,
	INVINCIBILITY,
}

export const PowerUp = trait({
	type: PowerUpType.HEALTH, // Default type
	active: false,
	duration: 10, // Duration in seconds
	strength: 1.0, // Multiplier for effect strength
});
