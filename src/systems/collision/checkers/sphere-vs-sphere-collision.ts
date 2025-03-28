import { Vector3 } from 'three';
import { CheckCollisionProps } from './check-collision';

export function checkSphereVsSphere({ transformA, colliderA, transformB, colliderB }: CheckCollisionProps) {
	// Apply collider offsets to positions
	const posA = new Vector3().copy(transformA.position).add(colliderA.offset);
	const posB = new Vector3().copy(transformB.position).add(colliderB.offset);

	const distance = posA.distanceTo(posB);
	const combinedRadius = colliderA.radius + colliderB.radius;

	if (distance < combinedRadius) {
		const penetration = combinedRadius - distance;
		const normal = new Vector3().subVectors(posB, posA).normalize();

		// Normal on y axis if they are very close
		if (distance < 0.0001) {
			normal.set(0, 1, 0);
		}

		return {
			normal,
			penetration,
			point: new Vector3().addVectors(posA, normal.clone().multiplyScalar(colliderA.radius)),
		};
	}
	return null;
}
