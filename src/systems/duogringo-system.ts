import { World } from 'koota';
import * as THREE from 'three';
import { actions } from '../actions';
import {
	Collider,
	ColliderType,
	CollisionEvents,
	CollisionLayer,
	DuogringoAnimation,
	DuogringoPower,
	Health,
	IsDuogringo,
	IsPlayer,
	Movement,
	PhysicsBody,
	Time,
	Transform,
} from '../traits';
import { findEntityById } from './collision/helpers';

const DETECTION_RANGE = 15; // Distance at which Duogringo starts pursuing the player
const ATTACK_RANGE = 0.5; // Distance at which Duogringo can attack (restored to original value)
const ATTACK_DURATION_BEFORE_DAMAGE = 0.5 * 1000; // Time before damage is applied in milliseconds
const ATTACK_COOLDOWN = 2.0 * 1000; // Time between attacks in milliseconds
const JUMP_FORCE = 1.5; // Force applied when jumping away from terrain
const JUMP_COOLDOWN = 5.0 * 1000; // Minimum time between jumps in milliseconds
const MOVEMENT_FORCE_MULTIPLIER = 10; // Force multiplier for movement, similar to player movement

/**
 * System to handle Duogringo's behavior:
 * - Detects player within detection range (15 units)
 * - Follows the player when detected
 * - Attacks when within attack range (0.5 units - close combat)
 * - Jumps away from terrain with cooldown
 * - Remains idle when player is too far away
 */
export function duogringoSystem(world: World) {
	const time = world.get(Time);
	if (!time) return;

	// Get bound actions
	const boundActions = actions(world);

	// Find player
	const player = world.queryFirst(IsPlayer, Transform, Health);
	const playerTransform = player?.get(Transform);
	const playerPos = playerTransform?.position;
	const playerUndamaged = !player?.get(Health)?.isDamaged;

	// Update each Duogringo entity
	world
		.query(IsDuogringo, Transform, Movement, DuogringoPower, DuogringoAnimation, CollisionEvents, PhysicsBody)
		.updateEach(([transform, movement, power, animation, collisions, physics], gringo) => {
			if (!(player && playerPos)) {
				animation.state = 'Idle';
				return;
			}

			// Set up variables
			const currentTime = time.current;
			const currentPos = transform.position;
			const distToPlayer = currentPos.distanceTo(playerPos);

			// Check if player is within detection range
			if (distToPlayer > DETECTION_RANGE) {
				// Player is too far away, Duogringo remains idle
				animation.state = 'Idle';
				power.enteredAttackRangeTime = undefined;
				return;
			}

			// Face towards player (only when player is detected)
			const dirToPlayer = new THREE.Vector3().subVectors(playerPos, currentPos).normalize();
			transform.rotation.y = Math.atan2(dirToPlayer.x, dirToPlayer.z);

			// Handle attack cooldown
			const attackCooldownTime = currentTime - (power.lastAttackTime ?? 0);

			if (attackCooldownTime < ATTACK_COOLDOWN) {
				animation.state = 'Idle';
				return;
			}

			// Attack! if it's time
			const timeInAttackRange = currentTime - (power.enteredAttackRangeTime ?? currentTime);

			if (timeInAttackRange >= ATTACK_DURATION_BEFORE_DAMAGE && playerUndamaged) {
				boundActions.applyDamage(player, gringo, power.baseDamage * (1 + power.power));
				power.enteredAttackRangeTime = undefined;
				power.lastAttackTime = currentTime;
				return;
			}

			// Update attack range timer
			const attackRange = ATTACK_RANGE * (1 + power.power * 0.5);

			if (distToPlayer > attackRange) {
				power.enteredAttackRangeTime = undefined;
			} else if (!power.enteredAttackRangeTime) {
				power.enteredAttackRangeTime = currentTime;
			}

			// Update animation state and movement
			let newState = animation.state;
			let forceMultiplier = 0;

			if (power.enteredAttackRangeTime) {
				newState = 'Attack';
				forceMultiplier = MOVEMENT_FORCE_MULTIPLIER / 2;
			} else {
				newState = 'Walk';
				forceMultiplier = MOVEMENT_FORCE_MULTIPLIER;
			}

			if (newState !== animation.state) {
				animation.state = newState;
			}

			if (forceMultiplier > 0) {
				const moveForce = dirToPlayer
					.clone()
					.setY(0) // Set y component to 0 to only move in x-z plane
					.normalize() // Re-normalize after zeroing y component
					.multiplyScalar(movement.thrust * power.baseSpeed * (1 + power.power * 0.5) * forceMultiplier);

				physics.forces.add(moveForce);
			}

			// Maybe jump if it's been long enough
			const timeSinceLastJump = currentTime - power.lastJumpTime;

			if (timeSinceLastJump >= JUMP_COOLDOWN && collisions.contacts.size > 0) {
				let jumpForce: number | undefined;

				// Check each contact until we find one we can try to jump over
				collisions.contacts.forEach((entityId) => {
					const otherEntity = findEntityById(world, entityId);
					const otherCollider = otherEntity?.get(Collider);
					if (!otherEntity || !otherCollider) return;

					if (
						otherCollider.layer === CollisionLayer.TERRAIN &&
						otherCollider.type !== ColliderType.HEIGHTFIELD
					) {
						jumpForce = JUMP_FORCE * (power.power * Math.random() * 10);
						return;
					}
				});

				// If we found a contact, jump
				if (jumpForce) {
					const jumpDir = new THREE.Vector3(Math.random() - 0.5, 1, Math.random() - 0.5).normalize();
					movement.velocity.add(jumpDir.multiplyScalar(jumpForce));

					power.lastJumpTime = currentTime;
				}
			}
		});
}
