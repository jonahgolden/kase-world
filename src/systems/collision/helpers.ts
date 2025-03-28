import { World } from 'koota';
import { Matrix4, Vector3 } from 'three';
import { Collider, Transform } from '../../traits';

/**
 * Helper function to find an entity by ID
 */
export function findEntityById(world: World, id: number) {
	return world.query(Transform, Collider).find((e) => e.id() === id);
}

// Helper function to project a point onto a line segment
export function projectPointOnLine(point: Vector3, lineStart: Vector3, lineEnd: Vector3): Vector3 {
	const line = lineEnd.clone().sub(lineStart);
	const len = line.length();
	if (len === 0) return lineStart.clone();

	line.normalize();
	const pointToStart = point.clone().sub(lineStart);
	const dot = pointToStart.dot(line);

	// Clamp to line segment
	const t = Math.max(0, Math.min(len, dot));
	return lineStart.clone().add(line.multiplyScalar(t));
}

// Calculate capsule-to-point normal
// Currently not used, but could be used to improve the normal calculation
function capsuleToPointNormal(capsulePos: Vector3, worldClosestPoint: Vector3, boxRotationMatrix: Matrix4) {
	const capsuleToPoint = new Vector3().subVectors(capsulePos, worldClosestPoint);
	const capsuleNormal = capsuleToPoint.clone().normalize();

	// Approximate surface normal by using the box's up vector transformed by its rotation
	const boxUp = new Vector3(0, 1, 0).applyMatrix4(boxRotationMatrix);

	// Blend between capsule normal and surface normal based on how vertical the collision is
	// The more vertical the capsule-to-point normal is, the more we use the surface normal
	const verticalAlignment = Math.abs(capsuleNormal.dot(boxUp));

	// How much to blend with surface normal
	// Higher values (closer to 1.0) will make the normal more closely match the surface angle
	// Lower values (closer to 0.0) will keep the original capsule-to-point behavior
	const blendFactor = 0.0;

	return capsuleNormal.lerp(boxUp, verticalAlignment * blendFactor).normalize();
}
