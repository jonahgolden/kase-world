import { trait } from 'koota';

/**
 * Represents an active scream effect
 */
export interface ActiveScream {
	id: number;
	effectTimer: number; // how long the effect remains visible
	chargeAmount: number; // how much the scream was charged (for visuals)
}

/**
 * Scream trait for the baby's scream attack
 * - cooldown: time until the scream can be used again (in seconds)
 * - power: current power level of the scream (0-100)
 * - range: range of the scream attack in units
 * - angle: cone angle of the scream attack in radians
 * - isCharging: whether the scream is currently charging
 * - chargeTime: current charge time (0 to maxChargeTime)
 * - maxChargeTime: maximum charge time (2.5 seconds)
 * - activeScreams: array of currently active scream effects
 */
export const Scream = trait({
	cooldown: 0, // Cooldown timer, 0 means available
	power: 100, // Scream power, affects damage
	range: 8, // Range of the scream attack in units
	angle: Math.PI / 4, // Cone angle of the scream attack (45 degrees)
	isCharging: false, // Whether the scream is currently charging
	chargeTime: 0, // Current charge time (0 to maxChargeTime)
	maxChargeTime: 2.5, // Maximum charge time in seconds
	activeScreams: [] as ActiveScream[], // Array of active scream effects
	nextScreamId: 0, // Counter for generating unique scream IDs
});
