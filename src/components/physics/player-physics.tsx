import { CapsuleCollider, RigidBody } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import { Entity } from 'koota';
import { useQueryFirst } from 'koota/react';
import { useRef } from 'react';
import type { RapierRigidBody } from '@react-three/rapier';
import { Input, IsPlayer, MovementMode, Transform } from '../../traits';
import { GAME_CONFIG } from '../../game-config';
import * as THREE from 'three';

/**
 * Player physics body component
 */
function PlayerPhysicsBody({ entity }: { entity: Entity }) {
	const rigidBodyRef = useRef<RapierRigidBody>(null);

	useFrame(() => {
		if (!rigidBodyRef.current) return;

		const input = entity.get(Input);
		const transform = entity.get(Transform);
		const movementMode = entity.get(MovementMode);
		if (!input || !transform) return;

		const rb = rigidBodyRef.current;

		// Apply rotation from mouse
		transform.rotation.y -= input.mouseDelta.x * GAME_CONFIG.input.mouseSensitivity;
		entity.set(Transform, transform);

		// Calculate movement direction based on rotation (same as original code)
		const forwardDir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, transform.rotation.y, 0));
		const rightDir = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, transform.rotation.y, 0));

		// Get current velocity
		const vel = rb.linvel();

		// Determine speed based on movement mode
		const mode = movementMode?.mode || 'crawl';
		const baseSpeed = 5; // Base units per second
		const speedMultiplier = mode === 'walk' ? GAME_CONFIG.player.walkSpeed : GAME_CONFIG.player.crawlSpeed;
		const moveSpeed = baseSpeed * speedMultiplier;

		// Calculate desired velocity based on input
		const moveVec = new THREE.Vector3();

		if (input.forward !== 0) {
			moveVec.addScaledVector(forwardDir, input.forward * moveSpeed);
		}
		if (input.strafe !== 0) {
			moveVec.addScaledVector(rightDir, input.strafe * moveSpeed);
		}

		// Set horizontal velocity, keep vertical velocity (for gravity/jumping)
		rb.setLinvel({ x: moveVec.x, y: vel.y, z: moveVec.z }, true);

		// Jump with mode-specific jump force (simple ground check: if vertical velocity is small, we're grounded)
		if (input.jump) {
			const vel = rb.linvel();
			if (Math.abs(vel.y) < 0.5) {
				const jumpForce = mode === 'walk' ? GAME_CONFIG.player.walkJumpForce : GAME_CONFIG.player.crawlJumpForce;
				rb.applyImpulse({ x: 0, y: jumpForce, z: 0 }, true);
			}
		}

		// Sync position from Rapier back to ECS
		// Subtract the collider offset so Transform stays at the baby's feet level
		const pos = rb.translation();
		const colliderOffset = GAME_CONFIG.player.colliderHeight / 2;
		transform.position.set(pos.x, pos.y - colliderOffset, pos.z);
		entity.set(Transform, transform);
	});

	const transform = entity.get(Transform);
	if (!transform) return null;

	// Offset the RigidBody upward by half the collider height
	// so the bottom of the capsule is at the baby's feet, not centered
	const colliderOffset = GAME_CONFIG.player.colliderHeight / 2;

	return (
		<RigidBody
			ref={rigidBodyRef}
			position={[transform.position.x, transform.position.y + colliderOffset, transform.position.z]}
			rotation={[0, transform.rotation.y, 0]}
			type="dynamic"
			colliders={false}
			lockRotations
			enabledRotations={[false, true, false]}
			linearDamping={3}
			angularDamping={1}
		>
			<CapsuleCollider
				args={[GAME_CONFIG.player.colliderHeight / 2, GAME_CONFIG.player.colliderRadius]}
			/>
		</RigidBody>
	);
}

/**
 * Rapier physics for the player
 * Handles movement with WASD and jumping with Space
 * Respects crawl/walk movement modes
 */
export function PlayerPhysics() {
	const player = useQueryFirst(IsPlayer, Transform, MovementMode);
	if (!player) return null;

	return <PlayerPhysicsBody entity={player} />;
}
