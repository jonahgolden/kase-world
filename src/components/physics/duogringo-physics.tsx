import { CapsuleCollider, RigidBody } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import { Entity } from 'koota';
import { useQueryFirst, useWorld } from 'koota/react';
import { useRef } from 'react';
import type { RapierRigidBody } from '@react-three/rapier';
import { IsDuogringo, IsPlayer, Transform } from '../../traits';
import { GAME_CONFIG } from '../../game-config';

/**
 * Duogringo physics body component
 */
function DuogringoPhysicsBody({ entity }: { entity: Entity }) {
	const world = useWorld();
	const rigidBodyRef = useRef<RapierRigidBody>(null);

	useFrame(() => {
		const player = world.queryFirst(IsPlayer, Transform);
		if (!player || !rigidBodyRef.current) return;

		const duogringoTransform = entity.get(Transform);
		const playerTransform = player.get(Transform);
		if (!duogringoTransform || !playerTransform) return;

		const rb = rigidBodyRef.current;

		// Calculate direction to player
		const dx = playerTransform.position.x - duogringoTransform.position.x;
		const dz = playerTransform.position.z - duogringoTransform.position.z;
		const distance = Math.sqrt(dx * dx + dz * dz);

		// Face toward player
		const angle = Math.atan2(dx, -dz);
		duogringoTransform.rotation.y = angle;

		// Move toward player if within detection range
		const vel = rb.linvel();
		if (distance < GAME_CONFIG.duogringo.detectionRange && distance > GAME_CONFIG.duogringo.attackRange) {
			const nx = dx / distance;
			const nz = dz / distance;

			const moveSpeed = 3; // Units per second
			rb.setLinvel({ x: nx * moveSpeed, y: vel.y, z: nz * moveSpeed }, true);
		} else {
			// Stop horizontal movement when not chasing
			rb.setLinvel({ x: 0, y: vel.y, z: 0 }, true);
		}

		// Sync position from Rapier back to ECS
		// Subtract the collider offset so Transform stays at Duogringo's feet level
		const pos = rb.translation();
		const colliderOffset = GAME_CONFIG.duogringo.colliderHeight / 2;
		duogringoTransform.position.set(pos.x, pos.y - colliderOffset, pos.z);
		entity.set(Transform, duogringoTransform);
	});

	const transform = entity.get(Transform);
	if (!transform) return null;

	// Offset the RigidBody upward by half the collider height
	// so the bottom of the capsule is at Duogringo's feet, not centered
	const colliderOffset = GAME_CONFIG.duogringo.colliderHeight / 2;

	return (
		<RigidBody
			ref={rigidBodyRef}
			position={[transform.position.x, transform.position.y + colliderOffset, transform.position.z]}
			rotation={[0, transform.rotation.y, 0]}
			type="dynamic"
			colliders={false}
			lockRotations
			enabledRotations={[false, true, false]}
			mass={GAME_CONFIG.duogringo.mass}
			linearDamping={3}
			angularDamping={1}
		>
			<CapsuleCollider
				args={[GAME_CONFIG.duogringo.colliderHeight / 2, GAME_CONFIG.duogringo.colliderRadius]}
			/>
		</RigidBody>
	);
}

/**
 * Rapier physics for Duogringo
 * Handles AI-driven movement toward player
 */
export function DuogringoPhysics() {
	const duogringo = useQueryFirst(IsDuogringo, Transform);
	if (!duogringo) return null;

	return <DuogringoPhysicsBody entity={duogringo} />;
}
