import { World } from 'koota';
import * as THREE from 'three';
import { actions } from '../actions';
import {
	Collider,
	ColliderType,
	CollisionEvents,
	DuogringoAnimation,
	DuogringoPower,
	IsDuogringo,
	IsPlayer,
	Movement,
	PhysicsBody,
	Time,
	Transform,
} from '../traits';
import { findEntityById } from './collision/helpers';

const ATTACK_RANGE = 0.2; // Distance at which Duogringo can attack
const ATTACK_COOLDOWN = 1.0 * 1000; // Time between attacks in milliseconds
const JUMP_FORCE = 1.5; // Force applied when jumping away from terrain
const JUMP_COOLDOWN = 5.0 * 1000; // Minimum time between jumps in milliseconds
const JUMP_HEATUP = 7.5 * 1000; // Maximum time between jumps in milliseconds
const MOVEMENT_FORCE_MULTIPLIER = 10; // Force multiplier for movement, similar to player movement

/**
 * System to handle Duogringo's behavior:
 * - Follows the player
 * - Attacks when in range
 * - Jumps away from terrain with cooldown
 */
export function duogringoSystem(world: World) {
	const time = world.get(Time);
	if (!time) return;

	// Find player position
	const playerQuery = world.query(IsPlayer, Transform);
	const playerEntries = Array.from(playerQuery.entries());
	const playerEntity = playerEntries[0]?.[1];
	if (!playerEntity) return;
	const playerPos = playerEntity.get(Transform)!.position;

	// Get bound actions
	const boundActions = actions(world);

	// Update each Duogringo entity
	world
		.query(IsDuogringo, Transform, Movement, DuogringoPower, DuogringoAnimation, CollisionEvents, PhysicsBody)
		.updateEach(([transform, movement, power, animation, collisions, physics]) => {
			const currentPos = transform.position;
			const dirToPlayer = new THREE.Vector3().subVectors(playerPos, currentPos).normalize();
			let collisionAttack = false;

			// Handle collisions
			const contacts = collisions.contacts;
			const currentTime = time.current;
			const timeSinceLastJump = currentTime - power.lastJumpTime;
			let jumpForce: number | undefined;

			if (contacts.size > 0) {
				// Check each contact
				contacts.forEach((entityId) => {
					const otherEntity = findEntityById(world, entityId);
					const otherCollider = otherEntity?.get(Collider);
					if (!otherEntity || !otherCollider) return;

					if (otherEntity.has(IsPlayer)) {
						const otherTransform = otherEntity.get(Transform);
						// Attack player if they are in front of duogringo
						if (otherTransform && otherTransform?.position.y <= currentPos.y) {
							collisionAttack = true;
							if (animation.state == 'Attack') {
								boundActions.applyDamage(otherEntity, power.baseDamage * (1 + power.power));
							}
						}
					}
					// Check jump cooldown
					if (
						!jumpForce &&
						timeSinceLastJump >= JUMP_COOLDOWN &&
						otherCollider.type !== ColliderType.HEIGHTFIELD
					) {
						jumpForce = JUMP_FORCE * (power.power * Math.random() * 10);
					}
				});

				if (!jumpForce && timeSinceLastJump >= JUMP_HEATUP) {
					jumpForce = JUMP_FORCE * (power.power * Math.random() * 5);
				}
			}

			if (jumpForce) {
				// Jump away from terrain using velocity for immediate response
				const jumpDir = new THREE.Vector3(Math.random() - 0.5, 1, Math.random() - 0.5).normalize();
				movement.velocity.add(jumpDir.multiplyScalar(jumpForce));

				// Update last jump time
				power.lastJumpTime = currentTime;
			}

			// Move towards player
			const distToPlayer = currentPos.distanceTo(playerPos);
			const attackRange = ATTACK_RANGE * (1 + power.power * 0.5);

			// Face towards player
			const angle = Math.atan2(dirToPlayer.x, dirToPlayer.z);
			transform.rotation.y = angle;

			if (collisionAttack) {
				animation.state = 'Attack';
			} else if (physics.isGrounded) {
				animation.state = 'Walk';
				// Move towards player in x and z planes using physics forces
				const moveForce = dirToPlayer
					.clone()
					.setY(0) // Set y component to 0 to only move in x-z plane
					.normalize() // Re-normalize after zeroing y component
					.multiplyScalar(
						movement.thrust * power.baseSpeed * (1 + power.power * 0.5) * MOVEMENT_FORCE_MULTIPLIER
					);

				physics.forces.add(moveForce);
			} else {
				animation.state = 'Idle';
			}
		});
}
