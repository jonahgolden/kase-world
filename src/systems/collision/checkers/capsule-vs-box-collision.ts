import { Matrix4, Vector3 } from 'three';
import { ColliderInstanceType, TransformType } from '../../../traits';
import { projectPointOnLine } from '../helpers';

export function checkCapsuleVsBox({
	capsuleTransform,
	capsuleCollider,
	boxTransform,
	boxCollider,
}: {
	capsuleTransform: TransformType;
	capsuleCollider: ColliderInstanceType;
	boxTransform: TransformType;
	boxCollider: ColliderInstanceType;
}) {
	// Apply collider offsets to positions
	const capsulePos = new Vector3().copy(capsuleTransform.position).add(capsuleCollider.offset);
	const boxPos = new Vector3().copy(boxTransform.position).add(boxCollider.offset);

	// Create box's world-to-local transform matrix
	const boxRotationMatrix = new Matrix4().makeRotationFromEuler(boxTransform.rotation);
	const boxScaleMatrix = new Matrix4().makeScale(
		boxTransform.scale.x,
		boxTransform.scale.y,
		boxTransform.scale.z
	);
	const boxTranslationMatrix = new Matrix4().makeTranslation(-boxPos.x, -boxPos.y, -boxPos.z);

	// Combine matrices to transform from world to box local space
	// Order matters! We need to: translate to origin -> apply inverse scale -> apply inverse rotation
	const worldToBoxLocal = new Matrix4()
		.multiply(boxRotationMatrix.clone().invert())
		.multiply(boxScaleMatrix.clone().invert())
		.multiply(boxTranslationMatrix);

	// Transform capsule position and radius to box local space
	const localCapsulePos = capsulePos.clone().applyMatrix4(worldToBoxLocal);

	// Calculate local radius by transforming a point offset by the radius
	const radiusPoint = capsulePos.clone().add(new Vector3(capsuleCollider.radius, 0, 0));
	const localRadiusPoint = radiusPoint.clone().applyMatrix4(worldToBoxLocal);
	const localRadius = localRadiusPoint.distanceTo(localCapsulePos);

	// Calculate capsule endpoints in local space
	const capsuleUp = new Vector3(0, 1, 0)
		.applyEuler(capsuleTransform.rotation)
		.multiplyScalar(capsuleCollider.height / 2); // Height is the distance between sphere centers

	// Transform the up vector to local space (without translation)
	const localCapsuleUp = capsuleUp.clone().applyMatrix4(new Matrix4().extractRotation(worldToBoxLocal));

	const localCapsuleTop = localCapsulePos.clone().add(localCapsuleUp);
	const localCapsuleBottom = localCapsulePos.clone().sub(localCapsuleUp);

	// In local space, the box is axis-aligned at the origin
	const halfSize = boxCollider.size.clone().multiplyScalar(0.5);
	const boxMin = halfSize.clone().multiplyScalar(-1);
	const boxMax = halfSize.clone();

	// Find closest point on box to capsule line segment
	// First, clamp both capsule endpoints to box bounds
	const clampedTop = new Vector3(
		Math.max(boxMin.x, Math.min(localCapsuleTop.x, boxMax.x)),
		Math.max(boxMin.y, Math.min(localCapsuleTop.y, boxMax.y)),
		Math.max(boxMin.z, Math.min(localCapsuleTop.z, boxMax.z))
	);

	const clampedBottom = new Vector3(
		Math.max(boxMin.x, Math.min(localCapsuleBottom.x, boxMax.x)),
		Math.max(boxMin.y, Math.min(localCapsuleBottom.y, boxMax.y)),
		Math.max(boxMin.z, Math.min(localCapsuleBottom.z, boxMax.z))
	);

	// Find closest point on box to capsule line segment
	const capsuleLine = localCapsuleTop.clone().sub(localCapsuleBottom);
	const capsuleLength = capsuleLine.length();

	// Find closest point and distance
	let closestPoint: Vector3;
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
	const boxToWorld = new Matrix4()
		.multiply(boxTranslationMatrix.clone().invert())
		.multiply(boxScaleMatrix)
		.multiply(boxRotationMatrix);

	const worldClosestPoint = closestPoint.applyMatrix4(boxToWorld);

	// Check for collision using distance to line segment
	if (distanceToLine < localRadius) {
		// Calculate normal and penetration depth
		const normal = new Vector3().subVectors(capsulePos, worldClosestPoint).normalize();
		const penetration = localRadius - distanceToLine;

		return { penetration, normal, point: worldClosestPoint };
	}

	return null;
}
