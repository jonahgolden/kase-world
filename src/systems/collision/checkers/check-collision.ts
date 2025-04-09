import { ColliderInstanceType, ColliderType, TransformType } from '../../../traits';
import { checkBoxVsBox } from './box-vs-box-collision';
import { checkCapsuleVsBox } from './capsule-vs-box-collision';
import { checkCapsuleVsCapsule } from './capsule-vs-capsule-collision';
import { checkCapsuleVsSphere } from './capsule-vs-sphere-collision';
import { checkDodecahedronVsBox } from './dodecahedron-vs-box-collision';
import { checkDodecahedronVsSphere } from './dodecahedron-vs-sphere-collision';
import { checkHeightfieldCollision } from './heightfield-collision';
import { checkSphereVsBox } from './sphere-vs-box-collision';
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

	// Box vs Capsule (using sphere-sweep test for capsule)
	if (colliderA.type === ColliderType.BOX && colliderB.type === ColliderType.CAPSULE) {
		return checkCapsuleVsBox({
			capsuleTransform: transformB,
			capsuleCollider: colliderB,
			boxTransform: transformA,
			boxCollider: colliderA,
		});
	}

	// Capsule vs Box (using sphere-sweep test for capsule)
	if (colliderA.type === ColliderType.CAPSULE && colliderB.type === ColliderType.BOX) {
		const result = checkCapsuleVsBox({
			capsuleTransform: transformA,
			capsuleCollider: colliderA,
			boxTransform: transformB,
			boxCollider: colliderB,
		});
		if (result) {
			result.normal.multiplyScalar(-1); // Flip normal since we swapped A/B
			return result;
		}
		return null;
	}

	// Capsule vs Sphere
	if (colliderA.type === ColliderType.CAPSULE && colliderB.type === ColliderType.SPHERE) {
		return checkCapsuleVsSphere({
			capsuleTransform: transformA,
			capsuleCollider: colliderA,
			sphereTransform: transformB,
			sphereCollider: colliderB,
		});
	}

	// Sphere vs Capsule
	if (colliderA.type === ColliderType.SPHERE && colliderB.type === ColliderType.CAPSULE) {
		const result = checkCapsuleVsSphere({
			capsuleTransform: transformB,
			capsuleCollider: colliderB,
			sphereTransform: transformA,
			sphereCollider: colliderA,
		});
		if (result) {
			result.normal.multiplyScalar(-1); // Flip normal since we swapped A/B
			return result;
		}
		return null;
	}

	// Capsule vs Capsule - still not working
	if (colliderA.type === ColliderType.CAPSULE && colliderB.type === ColliderType.CAPSULE) {
		return checkCapsuleVsCapsule({ transformA, colliderA, transformB, colliderB });
	}

	// Box vs Sphere
	if (colliderA.type === ColliderType.BOX && colliderB.type === ColliderType.SPHERE) {
		return checkSphereVsBox({
			sphereTransform: transformB,
			sphereCollider: colliderB,
			boxTransform: transformA,
			boxCollider: colliderA,
		});
	}

	// Sphere vs Box
	if (colliderA.type === ColliderType.SPHERE && colliderB.type === ColliderType.BOX) {
		const result = checkSphereVsBox({
			sphereTransform: transformA,
			sphereCollider: colliderA,
			boxTransform: transformB,
			boxCollider: colliderB,
		});
		if (result) {
			result.normal.multiplyScalar(-1); // Flip normal since we swapped A/B
			return result;
		}
		return null;
	}

	// Dodecahedron vs Box
	if (colliderA.type === ColliderType.DODECAHEDRON && colliderB.type === ColliderType.BOX) {
		const result = checkDodecahedronVsBox({ transformA, colliderA, transformB, colliderB });
		if (result) {
			result.normal.multiplyScalar(-1); // Flip normal since we swapped A/B
			return result;
		}
		return null;
	}

	// Box vs Dodecahedron
	if (colliderA.type === ColliderType.BOX && colliderB.type === ColliderType.DODECAHEDRON) {
		return checkDodecahedronVsBox({
			transformA: transformB,
			colliderA: colliderB,
			transformB: transformA,
			colliderB: colliderA,
		});
	}

	// Dodecahedron vs Sphere
	if (colliderA.type === ColliderType.DODECAHEDRON && colliderB.type === ColliderType.SPHERE) {
		// Implement basic collision detection logic here
		return checkDodecahedronVsSphere({ transformA, colliderA, transformB, colliderB });
	}

	// Sphere vs Dodecahedron
	if (colliderA.type === ColliderType.SPHERE && colliderB.type === ColliderType.DODECAHEDRON) {
		const result = checkDodecahedronVsSphere({
			transformA: transformB,
			colliderA: colliderB,
			transformB: transformA,
			colliderB: colliderA,
		});
		if (result) {
			result.normal.multiplyScalar(-1); // Flip normal since we swapped A/B
			return result;
		}
		return null;
	}

	return null;
}
