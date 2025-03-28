import * as THREE from 'three';
import { ColliderInstanceType, TransformType } from '../../../traits';

const _localSpherePos = new THREE.Vector3();
const _closestPoint = new THREE.Vector3();
const _normal = new THREE.Vector3();

export interface CheckSphereVsBoxProps {
	sphereTransform: TransformType;
	sphereCollider: ColliderInstanceType;
	boxTransform: TransformType;
	boxCollider: ColliderInstanceType;
}

/**
 * Check collision between a sphere and a box
 * Transforms sphere into box's local space for simpler AABB calculations
 * Accounts for scaling of both shapes
 */
export function checkSphereVsBox({
	sphereTransform,
	sphereCollider,
	boxTransform,
	boxCollider,
}: CheckSphereVsBoxProps) {
	// Apply collider offsets to positions
	const spherePos = new THREE.Vector3().copy(sphereTransform.position).add(sphereCollider.offset);
	const boxPos = new THREE.Vector3().copy(boxTransform.position).add(boxCollider.offset);

	// Calculate actual sphere radius accounting for scale
	// Use average scale since sphere should scale uniformly
	const sphereScale = sphereTransform.scale;
	const avgSphereScale = (sphereScale.x + sphereScale.y + sphereScale.z) / 3;
	const actualSphereRadius = sphereCollider.radius * avgSphereScale;

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

	// Transform sphere position to box local space
	_localSpherePos.copy(spherePos).applyMatrix4(worldToBoxLocal);

	// In local space, the box is axis-aligned at the origin
	const halfSize = boxCollider.size.clone().multiplyScalar(0.5);
	const boxMin = halfSize.clone().multiplyScalar(-1);
	const boxMax = halfSize.clone();

	// Find closest point on box to sphere center
	_closestPoint.copy(_localSpherePos).clamp(boxMin, boxMax);

	// Get vector from closest point to sphere center
	const localNormal = _localSpherePos.clone().sub(_closestPoint);
	const localDistance = localNormal.length();

	// If sphere center is inside box, we need special handling
	if (localDistance < 1e-6) {
		// Find which axis has the smallest penetration
		const penetrations = [
			Math.abs(boxMax.x - _localSpherePos.x),
			Math.abs(_localSpherePos.x - boxMin.x),
			Math.abs(boxMax.y - _localSpherePos.y),
			Math.abs(_localSpherePos.y - boxMin.y),
			Math.abs(boxMax.z - _localSpherePos.z),
			Math.abs(_localSpherePos.z - boxMin.z),
		];

		const minPenetration = Math.min(...penetrations);
		const minIndex = penetrations.indexOf(minPenetration);

		// Set normal based on axis with smallest penetration
		_normal.set(0, 0, 0);
		if (minIndex === 0) _normal.set(1, 0, 0);
		else if (minIndex === 1) _normal.set(-1, 0, 0);
		else if (minIndex === 2) _normal.set(0, 1, 0);
		else if (minIndex === 3) _normal.set(0, -1, 0);
		else if (minIndex === 4) _normal.set(0, 0, 1);
		else _normal.set(0, 0, -1);

		// Transform normal to world space (only rotation, no translation/scale)
		_normal.applyMatrix4(new THREE.Matrix4().extractRotation(boxRotationMatrix));

		return {
			normal: _normal,
			penetration: actualSphereRadius + minPenetration,
			point: _closestPoint.applyMatrix4(boxRotationMatrix).multiply(boxTransform.scale).add(boxPos),
		};
	}

	// Transform box-to-world matrix
	// Order matters! We need to: apply rotation -> apply scale -> translate from origin
	const boxToWorld = new THREE.Matrix4()
		.multiply(boxTranslationMatrix.clone().invert())
		.multiply(boxScaleMatrix)
		.multiply(boxRotationMatrix);

	// Transform closest point back to world space
	const worldClosestPoint = _closestPoint.clone().applyMatrix4(boxToWorld);

	// Get world space normal and check for collision
	_normal.copy(spherePos).sub(worldClosestPoint).normalize();
	const worldDistance = spherePos.distanceTo(worldClosestPoint);

	if (worldDistance < actualSphereRadius) {
		return {
			normal: _normal,
			penetration: actualSphereRadius - worldDistance,
			point: worldClosestPoint,
		};
	}

	return null;
}
