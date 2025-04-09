import * as THREE from 'three';
import { CheckCollisionProps } from './check-collision';

// Helper function to get the closest point on a scaled box to a point
function getClosestPointOnBox(
	point: THREE.Vector3,
	boxCenter: THREE.Vector3,
	boxSize: THREE.Vector3,
	boxScale: THREE.Vector3
): THREE.Vector3 {
	const closest = point.clone();

	// Apply inverse scale to work in box's local space
	const scaledSize = boxSize.clone().multiply(boxScale);

	// Clamp each coordinate to the box's bounds
	closest.x = Math.max(
		boxCenter.x - scaledSize.x * 0.5,
		Math.min(boxCenter.x + scaledSize.x * 0.5, closest.x)
	);
	closest.y = Math.max(
		boxCenter.y - scaledSize.y * 0.5,
		Math.min(boxCenter.y + scaledSize.y * 0.5, closest.y)
	);
	closest.z = Math.max(
		boxCenter.z - scaledSize.z * 0.5,
		Math.min(boxCenter.z + scaledSize.z * 0.5, closest.z)
	);

	return closest;
}

export function checkDodecahedronVsBox({
	transformA,
	colliderA,
	transformB,
	colliderB,
}: CheckCollisionProps) {
	// Get world positions
	const dodecahedronPos = transformA.position.clone().add(colliderA.offset);
	const boxPos = transformB.position.clone().add(colliderB.offset);

	// Get the closest point on the scaled box to the dodecahedron center
	const closestPoint = getClosestPointOnBox(dodecahedronPos, boxPos, colliderB.size, transformB.scale);

	// Calculate direction from closest point to dodecahedron center
	const direction = dodecahedronPos.clone().sub(closestPoint);
	const distance = direction.length();

	// Get the scaled radius of the dodecahedron
	// Since scale might not be uniform, use the largest scale component
	const maxScale = Math.max(transformA.scale.x, transformA.scale.y, transformA.scale.z);
	const scaledRadius = colliderA.radius * maxScale;

	// Check for collision
	if (distance < scaledRadius) {
		// If the distance is 0, we're inside the box, so pick a default normal
		let normal;
		if (distance < Number.EPSILON) {
			// Find the closest face and use its normal
			const scaledBoxExtents = colliderB.size.clone().multiply(transformB.scale).multiplyScalar(0.5);
			const relativePos = dodecahedronPos.clone().sub(boxPos);

			// Find which face we're closest to
			const absX = Math.abs(relativePos.x / scaledBoxExtents.x);
			const absY = Math.abs(relativePos.y / scaledBoxExtents.y);
			const absZ = Math.abs(relativePos.z / scaledBoxExtents.z);

			normal = new THREE.Vector3();
			if (absX > absY && absX > absZ) {
				normal.x = Math.sign(relativePos.x);
			} else if (absY > absZ) {
				normal.y = Math.sign(relativePos.y);
			} else {
				normal.z = Math.sign(relativePos.z);
			}
		} else {
			normal = direction.normalize();
		}

		return {
			normal,
			penetration: scaledRadius - distance,
		};
	}

	return null;
}
