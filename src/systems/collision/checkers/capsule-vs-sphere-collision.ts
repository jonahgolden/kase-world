import * as THREE from 'three';
import { ColliderInstanceType, TransformType } from '../../../traits';

const _capsuleStart = new THREE.Vector3();
const _capsuleEnd = new THREE.Vector3();
const _sphereCenter = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _closestPoint = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _radiusPoint = new THREE.Vector3();

export interface CheckCapsuleVsSphereProps {
	capsuleTransform: TransformType;
	capsuleCollider: ColliderInstanceType;
	sphereTransform: TransformType;
	sphereCollider: ColliderInstanceType;
}

/**
 * Check collision between a capsule and a sphere
 * Uses closest point on capsule line segment to sphere center
 * Accounts for scaling when calculating actual radii
 */
export function checkCapsuleVsSphere({
	capsuleTransform,
	capsuleCollider,
	sphereTransform,
	sphereCollider,
}: CheckCapsuleVsSphereProps) {
	// Apply collider offsets to positions
	const capsulePos = new THREE.Vector3().copy(capsuleTransform.position).add(capsuleCollider.offset);
	const spherePos = new THREE.Vector3().copy(sphereTransform.position).add(sphereCollider.offset);

	// Calculate actual capsule radius accounting for scale
	// Use the same technique as capsule-vs-box: transform a point offset by radius
	_radiusPoint.copy(capsulePos).add(new THREE.Vector3(capsuleCollider.radius, 0, 0));
	const capsuleScale = capsuleTransform.scale;
	_radiusPoint.sub(capsulePos).multiply(capsuleScale).add(capsulePos);
	const actualCapsuleRadius = _radiusPoint.distanceTo(capsulePos);

	// Calculate actual sphere radius accounting for scale
	// Use average scale for sphere since it should scale uniformly
	const sphereScale = sphereTransform.scale;
	const avgSphereScale = (sphereScale.x + sphereScale.y + sphereScale.z) / 3;
	const actualSphereRadius = sphereCollider.radius * avgSphereScale;

	// Get capsule endpoints in world space
	_quaternion.setFromEuler(capsuleTransform.rotation);
	const capsuleUp = new THREE.Vector3(0, 1, 0)
		.applyQuaternion(_quaternion)
		.multiply(capsuleScale) // Apply scale to the up vector
		.normalize()
		.multiplyScalar(capsuleCollider.height / 2);

	_capsuleStart.copy(capsulePos).sub(capsuleUp);
	_capsuleEnd.copy(capsulePos).add(capsuleUp);

	// Get sphere center in world space
	_sphereCenter.copy(spherePos);

	// Find closest point on capsule line segment to sphere center
	const t = closestPointOnLineSegmentRatio(_capsuleStart, _capsuleEnd, _sphereCenter);
	_closestPoint.copy(_capsuleStart).lerp(_capsuleEnd, t);

	// Get vector from closest point to sphere center
	_normal.copy(_sphereCenter).sub(_closestPoint);
	const distance = _normal.length();

	// Combined radii using actual scaled values
	const totalRadius = actualCapsuleRadius + actualSphereRadius;

	// Check for collision
	if (distance < totalRadius) {
		// Normalize the normal if we have a non-zero distance
		if (distance > 0) {
			_normal.multiplyScalar(1 / distance);
		} else {
			// If centers overlap exactly, use capsule's up direction as fallback
			_normal.copy(capsuleUp).normalize();
		}

		return {
			normal: _normal,
			penetration: totalRadius - distance,
			point: _closestPoint.clone(),
		};
	}

	return null;
}

/**
 * Helper function to get ratio of closest point on line segment
 * Returns value between 0-1 representing position along segment
 */
function closestPointOnLineSegmentRatio(
	start: THREE.Vector3,
	end: THREE.Vector3,
	point: THREE.Vector3
): number {
	const segment = end.clone().sub(start);
	const segmentLength = segment.length();

	if (segmentLength === 0) return 0;

	segment.multiplyScalar(1 / segmentLength); // normalize
	const pointToStart = point.clone().sub(start);
	const t = segment.dot(pointToStart) / segmentLength;

	return Math.max(0, Math.min(1, t)); // clamp between 0-1
}
