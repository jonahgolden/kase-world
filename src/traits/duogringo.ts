import { trait } from 'koota';

// Tag trait to identify Duogringo
export const IsDuogringo = trait();

// Duogringo constants
export const DUOGRINGO_BASE_SCALE = 0.15;
export const DUOGRINGO_BASE_SPEED = 5;
export const DUOGRINGO_BASE_DAMAGE = 10;

type PowerInstanceType = {
	power: number;
	baseSize: number;
	baseSpeed: number;
	baseDamage: number;
	lastJumpTime: number;
	enteredAttackRangeTime: number | undefined;
	lastAttackTime: number | undefined;
};

// Duogringo's power level affects size, speed, and damage
export const DuogringoPower = trait<PowerInstanceType>({
	power: 1.0, // Base power level, increases with player screams
	baseSize: DUOGRINGO_BASE_SCALE, // Base size scale
	baseSpeed: DUOGRINGO_BASE_SPEED, // Base movement speed
	baseDamage: DUOGRINGO_BASE_DAMAGE, // Base damage amount
	lastJumpTime: 0, // Time of last jump (for jump cooldown)
	enteredAttackRangeTime: undefined, // Time last entered attack range
	lastAttackTime: undefined, // Time last attacked
});

// Animation state for Duogringo
export type DuogringoAnimationState = 'Idle' | 'Walk' | 'Attack';

export const DuogringoAnimation = trait({
	state: 'Idle' as DuogringoAnimationState,
	transitionTime: 0, // Time for animation transitions
});
