import * as THREE from 'three';
import { ColliderInstanceType, ColliderType, TransformType } from '../../traits';
import { projectPointOnLine } from './helpers';

// Reusable vectors to avoid allocations
const tempVecA = new THREE.Vector3();
const tempVecB = new THREE.Vector3();

interface TestCollisionProps {
	transformA: TransformType;
	transformB: TransformType;
	colliderA: ColliderInstanceType;
	colliderB: ColliderInstanceType;
}
/**
 * Old collision test before adding ColliderType.HEIGHTFIELD
 *
 * Tests if two entities are colliding based on their collider shapes
 */
export function testCollision({ transformA, transformB, colliderA, colliderB }: TestCollisionProps): {
	colliding: boolean;
	penetrationDepth?: number;
	normal?: THREE.Vector3;
} {
	// Apply collider offsets to positions
	const posA = tempVecA.copy(transformA.position).add(colliderA.offset);
	const posB = tempVecB.copy(transformB.position).add(colliderB.offset);

	// Sphere vs Sphere
	if (colliderA.type === ColliderType.SPHERE && colliderB.type === ColliderType.SPHERE) {
		const distance = posA.distanceTo(posB);
		const combinedRadius = colliderA.radius + colliderB.radius;

		if (distance < combinedRadius) {
			const penetrationDepth = combinedRadius - distance;

			let normal = tempVecA.copy(posB).sub(posA).normalize();
			// Normal on y axis if they are very close
			if (distance < 0.0001) {
				normal = new THREE.Vector3(0, 1, 0);
			}

			return { colliding: true, penetrationDepth, normal };
		}

		return { colliding: false };
	}

	// Box vs Box (OBB collision test using Separating Axis Theorem)
	if (colliderA.type === ColliderType.BOX && colliderB.type === ColliderType.BOX) {
		// Calculate half sizes considering scale
		const halfSizeA = colliderA.size.clone().multiply(transformA.scale).multiplyScalar(0.5);
		const halfSizeB = colliderB.size.clone().multiply(transformB.scale).multiplyScalar(0.5);

		// Create rotation matrices from Euler angles
		const matrixA = new THREE.Matrix4().makeRotationFromEuler(transformA.rotation);
		const matrixB = new THREE.Matrix4().makeRotationFromEuler(transformB.rotation);

		// Get the box axes (normalized direction vectors)
		const axesA = [
			new THREE.Vector3(1, 0, 0).applyMatrix4(matrixA),
			new THREE.Vector3(0, 1, 0).applyMatrix4(matrixA),
			new THREE.Vector3(0, 0, 1).applyMatrix4(matrixA),
		];
		const axesB = [
			new THREE.Vector3(1, 0, 0).applyMatrix4(matrixB),
			new THREE.Vector3(0, 1, 0).applyMatrix4(matrixB),
			new THREE.Vector3(0, 0, 1).applyMatrix4(matrixB),
		];

		// Get all axes to test (15 axes total: 3 from A, 3 from B, 9 cross products)
		const axes = [...axesA, ...axesB];
		// Add cross products of all pairs of axes
		for (const axisA of axesA) {
			for (const axisB of axesB) {
				const cross = new THREE.Vector3().crossVectors(axisA, axisB);
				if (cross.lengthSq() > 0.001) {
					// Ignore parallel axes
					cross.normalize();
					axes.push(cross);
				}
			}
		}

		// Calculate the vector between box centers
		const centerDiff = new THREE.Vector3().subVectors(posB, posA);

		let minPenetration = Infinity;
		let minAxis = axes[0];

		// Test all axes (Separating Axis Theorem)
		for (const axis of axes) {
			// Project box A's half-extents onto the axis
			const projA =
				Math.abs(axesA[0].dot(axis) * halfSizeA.x) +
				Math.abs(axesA[1].dot(axis) * halfSizeA.y) +
				Math.abs(axesA[2].dot(axis) * halfSizeA.z);

			// Project box B's half-extents onto the axis
			const projB =
				Math.abs(axesB[0].dot(axis) * halfSizeB.x) +
				Math.abs(axesB[1].dot(axis) * halfSizeB.y) +
				Math.abs(axesB[2].dot(axis) * halfSizeB.z);

			// Project the center difference vector onto the axis
			const centerProj = centerDiff.dot(axis);

			// Calculate overlap
			const overlap = projA + projB - Math.abs(centerProj);

			// If there's no overlap on any axis, the boxes don't intersect
			if (overlap <= 0) {
				return { colliding: false };
			}

			// Keep track of minimum penetration
			if (overlap < minPenetration) {
				minPenetration = overlap;
				minAxis = axis;
			}
		}

		// If we get here, the boxes are colliding
		// Ensure the normal points from A to B
		const normal = minAxis.clone();
		if (centerDiff.dot(normal) < 0) {
			normal.multiplyScalar(-1);
		}

		return {
			colliding: true,
			penetrationDepth: minPenetration,
			normal: normal,
		};
	}

	// Capsule vs Box (using sphere-sweep test for capsule)
	if (
		(colliderA.type === ColliderType.CAPSULE && colliderB.type === ColliderType.BOX) ||
		(colliderA.type === ColliderType.BOX && colliderB.type === ColliderType.CAPSULE)
	) {
		// Ensure A is the capsule and B is the box
		let capsulePos: THREE.Vector3;
		let capsuleHeight: number;
		let capsuleRadius: number;
		let boxPos: THREE.Vector3;
		let boxSize: THREE.Vector3;
		let boxTransform: TransformType;
		let capsuleTransform: TransformType;

		if (colliderA.type === ColliderType.CAPSULE) {
			capsulePos = posA;
			capsuleHeight = colliderA.height; // Height is already the distance between sphere centers
			capsuleRadius = colliderA.radius;
			boxPos = posB;
			boxSize = colliderB.size;
			boxTransform = transformB;
			capsuleTransform = transformA;
		} else {
			capsulePos = posB;
			capsuleHeight = colliderB.height; // Height is already the distance between sphere centers
			capsuleRadius = colliderB.radius;
			boxPos = posA;
			boxSize = colliderA.size;
			boxTransform = transformA;
			capsuleTransform = transformB;
		}

		// Create box's world-to-local transform matrix
		const boxRotationMatrix = new THREE.Matrix4().makeRotationFromEuler(boxTransform.rotation);
		const boxScaleMatrix = new THREE.Matrix4().makeScale(
			boxTransform.scale.x,
			boxTransform.scale.y,
			boxTransform.scale.z
		);
		const boxTranslationMatrix = new THREE.Matrix4().makeTranslation(-boxPos.x, -boxPos.y, -boxPos.z);

		// Combine matrices to transform from world to box local space
		// Order matters! We need to: translate to origin -> apply inverse scale -> apply inverse rotation
		const worldToBoxLocal = new THREE.Matrix4()
			.multiply(boxRotationMatrix.clone().invert())
			.multiply(boxScaleMatrix.clone().invert())
			.multiply(boxTranslationMatrix);

		// Transform capsule position and radius to box local space
		const localCapsulePos = capsulePos.clone().applyMatrix4(worldToBoxLocal);

		// Calculate local radius by transforming a point offset by the radius
		const radiusPoint = capsulePos.clone().add(new THREE.Vector3(capsuleRadius, 0, 0));
		const localRadiusPoint = radiusPoint.clone().applyMatrix4(worldToBoxLocal);
		const localRadius = localRadiusPoint.distanceTo(localCapsulePos);

		// Calculate capsule endpoints in local space
		const capsuleUp = new THREE.Vector3(0, 1, 0)
			.applyEuler(capsuleTransform.rotation)
			.multiplyScalar(capsuleHeight / 2);

		// Transform the up vector to local space (without translation)
		const localCapsuleUp = capsuleUp
			.clone()
			.applyMatrix4(new THREE.Matrix4().extractRotation(worldToBoxLocal));

		const localCapsuleTop = localCapsulePos.clone().add(localCapsuleUp);
		const localCapsuleBottom = localCapsulePos.clone().sub(localCapsuleUp);

		// In local space, the box is axis-aligned at the origin
		const halfSize = boxSize.clone().multiplyScalar(0.5);
		const boxMin = halfSize.clone().multiplyScalar(-1);
		const boxMax = halfSize.clone();

		// Find closest point on box to capsule line segment
		// First, clamp both capsule endpoints to box bounds
		const clampedTop = new THREE.Vector3(
			Math.max(boxMin.x, Math.min(localCapsuleTop.x, boxMax.x)),
			Math.max(boxMin.y, Math.min(localCapsuleTop.y, boxMax.y)),
			Math.max(boxMin.z, Math.min(localCapsuleTop.z, boxMax.z))
		);

		const clampedBottom = new THREE.Vector3(
			Math.max(boxMin.x, Math.min(localCapsuleBottom.x, boxMax.x)),
			Math.max(boxMin.y, Math.min(localCapsuleBottom.y, boxMax.y)),
			Math.max(boxMin.z, Math.min(localCapsuleBottom.z, boxMax.z))
		);

		// Find closest point on box to capsule line segment
		const capsuleLine = localCapsuleTop.clone().sub(localCapsuleBottom);
		const capsuleLength = capsuleLine.length();

		// Find closest point and distance
		let closestPoint: THREE.Vector3;
		let distanceToLine: number;

		if (capsuleLength < 0.0001) {
			// Capsule is effectively a sphere, use either point
			closestPoint = clampedTop;
			distanceToLine = localCapsulePos.distanceTo(clampedTop);
		} else {
			// Normalize capsule line for projections
			const capsuleDir = capsuleLine.clone().normalize();

			// Project clamped points onto capsule line
			const topProjection = projectPointOnLine(clampedTop, localCapsuleBottom, localCapsuleTop);
			const bottomProjection = projectPointOnLine(clampedBottom, localCapsuleBottom, localCapsuleTop);

			// Get distances from clamped points to their projections
			const topDistance = clampedTop.distanceTo(topProjection);
			const bottomDistance = clampedBottom.distanceTo(bottomProjection);

			// Check if projections are within capsule segment
			const topParam = capsuleDir.dot(topProjection.clone().sub(localCapsuleBottom));
			const bottomParam = capsuleDir.dot(bottomProjection.clone().sub(localCapsuleBottom));

			const topInSegment = topParam >= 0 && topParam <= capsuleLength;
			const bottomInSegment = bottomParam >= 0 && bottomParam <= capsuleLength;

			// Also check direct distances to capsule endpoints
			const distanceToTop = clampedTop.distanceTo(localCapsuleTop);
			const distanceToBottom = clampedBottom.distanceTo(localCapsuleBottom);

			// Find the smallest valid distance
			if (topInSegment && (!bottomInSegment || topDistance <= bottomDistance)) {
				closestPoint = clampedTop;
				distanceToLine = topDistance;
			} else if (bottomInSegment) {
				closestPoint = clampedBottom;
				distanceToLine = bottomDistance;
			} else if (distanceToTop <= distanceToBottom) {
				closestPoint = clampedTop;
				distanceToLine = distanceToTop;
			} else {
				closestPoint = clampedBottom;
				distanceToLine = distanceToBottom;
			}
		}

		// Transform back to world space matrix
		// Order matters! We need to: apply rotation -> apply scale -> translate from origin
		const boxToWorld = new THREE.Matrix4()
			.multiply(boxTranslationMatrix.clone().invert())
			.multiply(boxScaleMatrix)
			.multiply(boxRotationMatrix);

		const worldClosestPoint = closestPoint.applyMatrix4(boxToWorld);

		// Check for collision using distance to line segment
		if (distanceToLine < localRadius) {
			// Calculate normal and penetration depth
			const normal = new THREE.Vector3().subVectors(capsulePos, worldClosestPoint).normalize();
			const penetrationDepth = localRadius - distanceToLine;

			return { colliding: true, penetrationDepth, normal };
		}

		return { colliding: false };
	}

	// Default case: no collision detected
	return { colliding: false };
}
