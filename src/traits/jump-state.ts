import { trait } from 'koota';

/**
 * JumpState trait for tracking entity jumping mechanics with cooldown
 * - jumpCooldown: time remaining until next jump is allowed (in seconds)
 * - cooldownDuration: how long to wait between jumps (default 2 seconds)
 * - isGrounded: whether the entity is currently touching the ground
 * - justLanded: flag to track when entity has just landed
 */
export const JumpState = trait({
	jumpCooldown: 0, // Time remaining until next jump (0 = can jump now)
	cooldownDuration: 2, // 2 second cooldown between jumps
	isGrounded: false, // Whether currently touching ground
	justLanded: false, // Flag for when entity just landed
});
