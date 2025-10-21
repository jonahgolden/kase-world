import * as THREE from 'three';
import { PHYSICS } from '../../../constants/physics';
import { PhysicsBodyInstanceType } from '../../../traits';
import { CollisionResult } from '../strategies/types';

// Reusable vectors to avoid garbage collection
const tempRelativeVelocity = new THREE.Vector3();
const tempTangent = new THREE.Vector3();

interface PhysicsBody {
	movement?: { velocity: THREE.Vector3 } | null;
	physics?: PhysicsBodyInstanceType | null;
	restitution: number;
	friction: number;
}

/**
 * Calculate collision impulse and friction for a collision
 */
export function calculateCollisionResponse(
	result: CollisionResult,
	bodyA: PhysicsBody,
	bodyB: PhysicsBody
): CollisionResult {
	// Calculate relative velocity
	tempRelativeVelocity.set(0, 0, 0);
	if (bodyB.movement) tempRelativeVelocity.add(bodyB.movement.velocity);
	if (bodyA.movement) tempRelativeVelocity.sub(bodyA.movement.velocity);

	const normalVelocity = tempRelativeVelocity.dot(result.normal);

	// Only calculate impulse if objects are moving towards each other
	if (normalVelocity < 0) {
		// Calculate restitution (bounce)
		const restitution = Math.min(bodyA.restitution, bodyB.restitution);

		// Calculate masses
		const massA = bodyA.physics && !bodyA.physics.isStatic ? bodyA.physics.mass : Infinity;
		const massB = bodyB.physics && !bodyB.physics.isStatic ? bodyB.physics.mass : Infinity;

		// Calculate impulse scalar
		const j = -(1 + restitution) * normalVelocity;
		const impulseScalar = j / (1 / massA + 1 / massB);

		// Set impulse
		result.impulse = result.normal.clone().multiplyScalar(impulseScalar);

		// Calculate friction if not at rest
		if (Math.abs(normalVelocity) >= PHYSICS.RESTING.VELOCITY_THRESHOLD) {
			// Get tangent vector
			tempTangent.copy(tempRelativeVelocity).addScaledVector(result.normal, -normalVelocity).normalize();

			// Calculate friction
			const friction = Math.min(bodyA.friction, bodyB.friction);
			const frictionScalar = -tempRelativeVelocity.dot(tempTangent) / (1 / massA + 1 / massB);
			const maxFriction = impulseScalar * friction;
			const usedFriction = Math.min(frictionScalar, maxFriction);

			// Set friction impulse
			result.frictionImpulse = tempTangent.clone().multiplyScalar(usedFriction);
		}
	}

	return result;
}
