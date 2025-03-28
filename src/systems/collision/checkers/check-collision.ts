import { ColliderInstanceType, ColliderType, TransformType } from '../../../traits';
import { checkBoxVsBox } from './box-vs-box-collision';
import { checkCapsuleVsBox } from './capsule-vs-box-collision';
import { checkHeightfieldCollision } from './heightfield-collision';
import { checkSphereVsSphere } from './sphere-vs-sphere-collision';

export interface CheckCollisionProps {
	transformA: TransformType;
	colliderA: ColliderInstanceType;
	transformB: TransformType;
	colliderB: ColliderInstanceType;
}

/**
 * Checks for collision between two colliders
 */
export function checkCollision({ transformA, colliderA, transformB, colliderB }: CheckCollisionProps) {
	// Non-heightfield vs Heightfield
	if (colliderA.type !== ColliderType.HEIGHTFIELD && colliderB.type === ColliderType.HEIGHTFIELD) {
		return checkHeightfieldCollision({
			entityTransform: transformA,
			entityCollider: colliderA,
			heightfieldTransform: transformB,
			heightfieldCollider: colliderB,
		});
	}

	// Heightfield vs Non-heightfield
	if (colliderA.type === ColliderType.HEIGHTFIELD && colliderB.type !== ColliderType.HEIGHTFIELD) {
		const result = checkHeightfieldCollision({
			entityTransform: transformB,
			entityCollider: colliderB,
			heightfieldTransform: transformA,
			heightfieldCollider: colliderA,
		});
		if (result) {
			// Originally, we thought we should flip the normal here.
			// But that didn't work, so we're not doing it.
			// result.normal.multiplyScalar(-1);
			return result;
		}
		return null;
	}

	// Sphere vs Sphere
	if (colliderA.type === ColliderType.SPHERE && colliderB.type === ColliderType.SPHERE) {
		return checkSphereVsSphere({ transformA, colliderA, transformB, colliderB });
	}

	// Box vs Box (OBB collision test using Separating Axis Theorem)
	if (colliderA.type === ColliderType.BOX && colliderB.type === ColliderType.BOX) {
		return checkBoxVsBox({ transformA, colliderA, transformB, colliderB });
	}

	// Capsule vs Box (using sphere-sweep test for capsule)
	if (colliderA.type === ColliderType.CAPSULE && colliderB.type === ColliderType.BOX) {
		return checkCapsuleVsBox({
			capsuleTransform: transformA,
			capsuleCollider: colliderA,
			boxTransform: transformB,
			boxCollider: colliderB,
		});
	}

	// Box vs Capsule (using sphere-sweep test for capsule)
	if (colliderA.type === ColliderType.BOX && colliderB.type === ColliderType.CAPSULE) {
		return checkCapsuleVsBox({
			capsuleTransform: transformB,
			capsuleCollider: colliderB,
			boxTransform: transformA,
			boxCollider: colliderA,
		});
	}

	return null;
}
