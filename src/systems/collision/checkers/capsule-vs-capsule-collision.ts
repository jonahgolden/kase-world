import * as THREE from 'three';
import { ColliderInstanceType, TransformType } from '../../../traits';

const _capsuleAStart = new THREE.Vector3();
const _capsuleAEnd = new THREE.Vector3();
const _capsuleBStart = new THREE.Vector3();
const _capsuleBEnd = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _closestA = new THREE.Vector3();
const _closestB = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _radiusPoint = new THREE.Vector3();

export interface CheckCapsuleVsCapsuleProps {
	transformA: TransformType;
	colliderA: ColliderInstanceType;
	transformB: TransformType;
	colliderB: ColliderInstanceType;
}

/**
 * Check collision between two capsules
 * Uses closest points between capsule line segments
 * Accounts for scaling when calculating actual radii
 */
export function checkCapsuleVsCapsule({
	transformA,
	colliderA,
	transformB,
	colliderB,
}: CheckCapsuleVsCapsuleProps) {
	// Apply collider offsets to positions
	const capsuleAPos = new THREE.Vector3().copy(transformA.position).add(colliderA.offset);
	const capsuleBPos = new THREE.Vector3().copy(transformB.position).add(colliderB.offset);

	// Calculate actual radius for capsule A accounting for scale
	_radiusPoint.copy(capsuleAPos).add(new THREE.Vector3(colliderA.radius, 0, 0));
	const scaleA = transformA.scale;
	_radiusPoint.sub(capsuleAPos).multiply(scaleA).add(capsuleAPos);
	const actualRadiusA = _radiusPoint.distanceTo(capsuleAPos);

	// Calculate actual radius for capsule B accounting for scale
	_radiusPoint.copy(capsuleBPos).add(new THREE.Vector3(colliderB.radius, 0, 0));
	const scaleB = transformB.scale;
	_radiusPoint.sub(capsuleBPos).multiply(scaleB).add(capsuleBPos);
	const actualRadiusB = _radiusPoint.distanceTo(capsuleBPos);

	// Get capsule A endpoints in world space
	_quaternion.setFromEuler(transformA.rotation);
	const capsuleAUp = new THREE.Vector3(0, 1, 0)
		.applyQuaternion(_quaternion)
		.multiply(scaleA) // Apply scale to the up vector
		.normalize()
		.multiplyScalar(colliderA.height / 2);

	_capsuleAStart.copy(capsuleAPos).sub(capsuleAUp);
	_capsuleAEnd.copy(capsuleAPos).add(capsuleAUp);

	// Get capsule B endpoints in world space
	_quaternion.setFromEuler(transformB.rotation);
	const capsuleBUp = new THREE.Vector3(0, 1, 0)
		.applyQuaternion(_quaternion)
		.multiply(scaleB) // Apply scale to the up vector
		.normalize()
		.multiplyScalar(colliderB.height / 2);

	_capsuleBStart.copy(capsuleBPos).sub(capsuleBUp);
	_capsuleBEnd.copy(capsuleBPos).add(capsuleBUp);

	// Find closest points between the two line segments
	closestPointsBetweenLines(_capsuleAStart, _capsuleAEnd, _capsuleBStart, _capsuleBEnd, _closestA, _closestB);

	// Get vector between closest points
	_normal.copy(_closestB).sub(_closestA);
	const distance = _normal.length();

	// Combined radii using actual scaled values
	const totalRadius = actualRadiusA + actualRadiusB;

	// Check for collision
	if (distance < totalRadius) {
		// Normalize the normal if we have a non-zero distance
		if (distance > 0) {
			_normal.multiplyScalar(1 / distance);
		} else {
			// If centers overlap exactly, use average of up vectors as fallback
			_normal.copy(capsuleAUp).add(capsuleBUp).normalize();
		}

		return {
			normal: _normal,
			penetration: totalRadius - distance,
			point: _closestA.clone(), // Use closest point on capsule A as collision point
		};
	}

	return null;
}

/**
 * Helper function to find closest points between two line segments
 * Modifies the provided vectors closestA and closestB with the results
 */
function closestPointsBetweenLines(
	a0: THREE.Vector3,
	a1: THREE.Vector3,
	b0: THREE.Vector3,
	b1: THREE.Vector3,
	closestA: THREE.Vector3,
	closestB: THREE.Vector3
) {
	const A = a1.clone().sub(a0);
	const B = b1.clone().sub(b0);
	const magA = A.length();
	const magB = B.length();

	if (magA === 0 || magB === 0) {
		// Handle degenerate cases
		closestA.copy(a0);
		closestB.copy(b0);
		return;
	}

	// Normalize direction vectors
	A.multiplyScalar(1 / magA);
	B.multiplyScalar(1 / magB);

	// Vector connecting line origins
	const r = a0.clone().sub(b0);

	// Compute dot products
	const a = A.dot(A);
	const b = A.dot(B);
	const c = B.dot(B);
	const d = A.dot(r);
	const e = B.dot(r);

	// Compute parametric points
	const denom = a * c - b * b;
	let s, t;

	if (denom < 1e-6) {
		// Lines are parallel, choose arbitrary closest points
		s = 0;
		t = e / c;
	} else {
		s = (b * e - c * d) / denom;
		t = (a * e - b * d) / denom;
	}

	// Clamp parameters to line segment bounds
	s = Math.max(0, Math.min(1, s));
	t = Math.max(0, Math.min(1, t));

	// Compute closest points
	closestA.copy(a0).addScaledVector(A, s * magA);
	closestB.copy(b0).addScaledVector(B, t * magB);
}
