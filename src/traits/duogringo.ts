import { trait } from 'koota';

// Tag trait to identify Duogringo
export const IsDuogringo = trait();

// Duogringo constants
export const DUOGRINGO_BASE_SCALE = 0.05;
export const DUOGRINGO_BASE_SPEED = 2.0;
export const DUOGRINGO_BASE_DAMAGE = 1;

// Duogringo's power level affects size, speed, and damage
export const DuogringoPower = trait({
	power: 1.0, // Base power level, increases with player screams
	baseSize: DUOGRINGO_BASE_SCALE, // Base size scale
	baseSpeed: DUOGRINGO_BASE_SPEED, // Base movement speed
	baseDamage: DUOGRINGO_BASE_DAMAGE, // Base damage amount
	lastJumpTime: 0, // Time of last jump (for jump cooldown)
});

// Animation state for Duogringo
export type DuogringoAnimationState = 'Idle' | 'Walk' | 'Attack';

export const DuogringoAnimation = trait({
	state: 'Idle' as DuogringoAnimationState,
	transitionTime: 0, // Time for animation transitions
});
