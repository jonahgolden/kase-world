import { Vector3 } from 'three';
import { ColliderInstanceType, ColliderType, TransformType } from '../../../traits';

/**
 * Checks collision between an entity and a heightfield
 */
export function checkHeightfieldCollision({
	entityTransform,
	entityCollider,
	heightfieldTransform,
	heightfieldCollider,
}: {
	entityTransform: TransformType;
	entityCollider: ColliderInstanceType;
	heightfieldTransform: TransformType;
	heightfieldCollider: ColliderInstanceType;
}) {
	// Get entity position in world space
	const position = new Vector3();
	position.copy(entityTransform.position).add(entityCollider.offset);

	// Different collision checks based on collider type
	switch (entityCollider.type) {
		case ColliderType.SPHERE: {
			// Get height data at sphere position
			const heightData = getHeightfieldData(heightfieldCollider, position.x, position.z);

			if (!heightData) {
				console.log('No height data found for sphere');
				return null;
			}

			const terrainY = heightData.height + heightfieldTransform.position.y + heightfieldCollider.offset.y;
			const penetration = entityCollider.radius - (position.y - terrainY);

			if (penetration > 0) {
				return {
					normal: heightData.normal,
					penetration,
					point: new Vector3(position.x, terrainY, position.z),
				};
			}
			break;
		}

		case ColliderType.CAPSULE: {
			// Calculate capsule endpoints
			const capsuleUp = new Vector3(0, 1, 0)
				.applyEuler(entityTransform.rotation)
				.multiplyScalar(entityCollider.height / 2);
			const topPoint = position.clone().add(capsuleUp);
			const bottomPoint = position.clone().sub(capsuleUp);

			// Check multiple points along the capsule
			const numPoints = 4; // Check 4 points along the capsule length
			let maxPenetration = -Infinity;
			const collisionNormal = new Vector3();
			const collisionPoint = new Vector3();

			for (let i = 0; i < numPoints; i++) {
				const t = i / (numPoints - 1);
				const checkPoint = new Vector3().lerpVectors(bottomPoint, topPoint, t);

				const heightData = getHeightfieldData(heightfieldCollider, checkPoint.x, checkPoint.z);

				if (heightData) {
					const terrainY = heightData.height + heightfieldTransform.position.y + heightfieldCollider.offset.y;
					const penetration = entityCollider.radius - (checkPoint.y - terrainY);

					if (penetration > maxPenetration) {
						maxPenetration = penetration;
						collisionNormal.copy(heightData.normal);
						collisionPoint.set(checkPoint.x, terrainY, checkPoint.z);
					}
				}
			}

			if (maxPenetration > 0) {
				return {
					normal: collisionNormal,
					penetration: maxPenetration,
					point: collisionPoint,
				};
			}
			break;
		}

		case ColliderType.BOX: {
			// Get height data at box center
			const heightData = getHeightfieldData(heightfieldCollider, position.x, position.z);

			if (!heightData) return null;

			const terrainY = heightData.height + heightfieldTransform.position.y + heightfieldCollider.offset.y;
			const penetration = entityCollider.size.y / 2 - (position.y - terrainY);

			if (penetration > 0) {
				return {
					normal: heightData.normal,
					penetration,
					point: new Vector3(position.x, terrainY, position.z),
				};
			}
			break;
		}
	}

	return null;
}

/**
 * Gets the height and normal at a specific point on a heightfield
 */
function getHeightfieldData(
	heightfield: ColliderInstanceType,
	worldX: number,
	worldZ: number
): { height: number; normal: Vector3 } | null {
	// Convert world coordinates to heightfield grid coordinates
	const gridSize = heightfield.size.x / (heightfield.resolution - 1);

	// Convert world coordinates to heightfield-local coordinates by subtracting heightfield position
	const localX = worldX - heightfield.offset.x;
	const localZ = worldZ - heightfield.offset.z;

	// Convert to grid coordinates
	const x = (localX + heightfield.size.x / 2) / gridSize;
	const z = (localZ + heightfield.size.z / 2) / gridSize;

	// Get grid cell indices
	const x0 = Math.floor(x);
	const z0 = Math.floor(z);
	const x1 = Math.min(x0 + 1, heightfield.resolution - 1);
	const z1 = Math.min(z0 + 1, heightfield.resolution - 1);

	// Check if point is within bounds
	if (x0 < 0 || x0 >= heightfield.resolution - 1 || z0 < 0 || z0 >= heightfield.resolution - 1) {
		return null;
	}

	// Get fractional position within cell
	const fx = x - x0;
	const fz = z - z0;

	// Get heights at cell corners
	const h00 = heightfield.heightData![z0 * heightfield.resolution + x0];
	const h10 = heightfield.heightData![z0 * heightfield.resolution + x1];
	const h01 = heightfield.heightData![z1 * heightfield.resolution + x0];
	const h11 = heightfield.heightData![z1 * heightfield.resolution + x1];

	// Bilinear interpolation of height
	const height = h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz;

	// Calculate normal using proper surface gradients
	// For a heightfield surface z = f(x,y), the normal is proportional to (-dz/dx, 1, -dz/dy)
	const dx = (h10 - h00) / gridSize; // x gradient in world units
	const dz = (h01 - h00) / gridSize; // z gradient in world units

	// Create normal vector pointing perpendicular to surface
	const normal = new Vector3(
		-dx, // x component (negative gradient in x)
		1.0, // y component (always positive to ensure upward normal)
		-dz // z component (negative gradient in z)
	).normalize();

	return { height, normal };
}
