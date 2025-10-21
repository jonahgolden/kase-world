import { World } from 'koota';
import { CollisionEvents, JumpState, PhysicsBody, Time } from '../traits';

/**
 * Jump system that manages jump state for entities
 * - Tracks ground contact status
 * - Updates cooldown timer
 * - Updates isGrounded state based on collision events
 */
export function jumpSystem(world: World) {
	const time = world.get(Time);
	if (!time) return;

	world.query(JumpState, PhysicsBody, CollisionEvents).updateEach(([jumpState, physics, collisionEvents]) => {
		const wasGrounded = jumpState.isGrounded;

		// Check if entity is grounded based on physics body
		jumpState.isGrounded = physics.isGrounded;

		// If we just landed (went from not grounded to grounded)
		if (!wasGrounded && jumpState.isGrounded) {
			jumpState.justLanded = true;
		} else {
			jumpState.justLanded = false;
		}

		// Update jump cooldown timer
		if (jumpState.jumpCooldown > 0) {
			jumpState.jumpCooldown = Math.max(0, jumpState.jumpCooldown - time.delta);
		}
	});
}
