import { CheckCollisionProps } from './check-collision';

export function checkDodecahedronVsSphere({
	transformA,
	colliderA,
	transformB,
	colliderB,
}: CheckCollisionProps) {
	// Get world positions
	const dodecahedronPos = transformA.position.clone().add(colliderA.offset);
	const spherePos = transformB.position.clone().add(colliderB.offset);

	// Get the scaled radius of the dodecahedron
	// Since scale might not be uniform, use the largest scale component
	const maxDodecahedronScale = Math.max(transformA.scale.x, transformA.scale.y, transformA.scale.z);
	const scaledDodecahedronRadius = colliderA.radius * maxDodecahedronScale;

	// Get the scaled radius of the sphere
	const maxSphereScale = Math.max(transformB.scale.x, transformB.scale.y, transformB.scale.z);
	const scaledSphereRadius = colliderB.radius * maxSphereScale;

	// Calculate distance between centers
	const direction = spherePos.clone().sub(dodecahedronPos);
	const distance = direction.length();

	// Combined radius for collision
	const combinedRadius = scaledDodecahedronRadius + scaledSphereRadius;

	// Check for collision
	if (distance < combinedRadius) {
		// Normalize direction for collision normal
		const normal = direction.normalize();

		// Calculate penetration depth
		const penetration = combinedRadius - distance;

		return {
			normal,
			penetration,
		};
	}

	return null;
}
