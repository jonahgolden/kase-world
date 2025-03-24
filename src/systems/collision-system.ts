import { World } from 'koota';
import * as THREE from 'three';
import { Transform } from '../traits';
import { Collider, ColliderInstanceType, ColliderType, CollisionEvents } from '../traits/collider';
import { Time } from '../traits/time';
import { CollisionPair, SpatialHashGrid } from '../utils/spatial-hash-grid';

// Constants for collision detection
const SPATIAL_HASH_CELL_SIZE = 5; // Size of the cells in the spatial hash grid

// Reusable objects for collision calculations (to avoid allocations)
const tempVec3A = new THREE.Vector3();
const tempVec3B = new THREE.Vector3();

/**
 * Used to track the current and previous state of collisions
 * for accurate collision enter/exit events
 */
const currentCollisions = new Map<number, Set<number>>(); // entity id -> set of entity ids it's colliding with

// Reusable spatial hash grid
const spatialGrid = new SpatialHashGrid(SPATIAL_HASH_CELL_SIZE);

/**
 * Main collision detection system.
 * Detects collisions between entities with Collider traits, and triggers appropriate responses.
 */
export function collisionSystem(world: World) {
	// Get delta time from the Time singleton
	const time = world.get(Time);
	if (!time) return;

	// Clear the spatial hash grid for this frame
	spatialGrid.clear();

	// Get all entities with Transform and Collider
	const colliderQuery = world.query(Transform, Collider);

	// Update the spatial hash grid with all entities
	colliderQuery.forEach((entity) => {
		const transform = entity.get(Transform);
		const collider = entity.get(Collider);

		if (!transform || !collider) return;

		// Insert entity into the spatial grid
		spatialGrid.insertEntity(entity, transform.position, collider);
	});

	// Get potential collision pairs
	const potentialCollisions = spatialGrid.getPotentialCollisions();

	// Process each potential collision
	processCollisions(potentialCollisions, world);

	// Update collision events (enter/stay/exit)
	updateCollisionEvents(world);
}

/**
 * Tests if two entities are colliding based on their collider shapes
 * @param transformA Transform trait instance of entity A
 * @param transformB Transform trait instance of entity B
 * @param colliderA Collider instance of entity A
 * @param colliderB Collider instance of entity B
 * @returns Collision result with information about the collision
 */
function testCollision(
	transformA: any,
	transformB: any,
	colliderA: ColliderInstanceType,
	colliderB: ColliderInstanceType
): {
	colliding: boolean;
	penetrationDepth?: number;
	normal?: THREE.Vector3;
} {
	// Apply collider offsets to positions
	const posA = tempVec3A.copy(transformA.position).add(colliderA.offset);
	const posB = tempVec3B.copy(transformB.position).add(colliderB.offset);

	// Perform collision test based on collider types

	// Sphere vs Sphere
	if (colliderA.type === ColliderType.SPHERE && colliderB.type === ColliderType.SPHERE) {
		const distance = posA.distanceTo(posB);
		const combinedRadius = colliderA.radius + colliderB.radius;

		if (distance < combinedRadius) {
			// Calculate penetration depth and normal
			const penetrationDepth = combinedRadius - distance;
			const normal =
				distance > 0.0001 ? tempVec3A.copy(posB).sub(posA).normalize() : new THREE.Vector3(0, 1, 0); // Default normal if positions are too close

			return {
				colliding: true,
				penetrationDepth,
				normal,
			};
		}

		return { colliding: false };
	}

	// Box vs Box (AABB collision test)
	if (colliderA.type === ColliderType.BOX && colliderB.type === ColliderType.BOX) {
		// Calculate half sizes
		const halfSizeA = colliderA.size.clone().multiplyScalar(0.5);
		const halfSizeB = colliderB.size.clone().multiplyScalar(0.5);

		// Calculate min and max points for each box
		const minA = new THREE.Vector3(posA.x - halfSizeA.x, posA.y - halfSizeA.y, posA.z - halfSizeA.z);
		const maxA = new THREE.Vector3(posA.x + halfSizeA.x, posA.y + halfSizeA.y, posA.z + halfSizeA.z);

		const minB = new THREE.Vector3(posB.x - halfSizeB.x, posB.y - halfSizeB.y, posB.z - halfSizeB.z);
		const maxB = new THREE.Vector3(posB.x + halfSizeB.x, posB.y + halfSizeB.y, posB.z + halfSizeB.z);

		// Check for overlap along each axis
		if (
			minA.x <= maxB.x &&
			maxA.x >= minB.x &&
			minA.y <= maxB.y &&
			maxA.y >= minB.y &&
			minA.z <= maxB.z &&
			maxA.z >= minB.z
		) {
			// Calculate penetration along each axis
			const penetrationX = Math.min(maxA.x - minB.x, maxB.x - minA.x);
			const penetrationY = Math.min(maxA.y - minB.y, maxB.y - minA.y);
			const penetrationZ = Math.min(maxA.z - minB.z, maxB.z - minA.z);

			// Find minimum penetration axis
			let penetrationDepth: number;
			const normal = new THREE.Vector3();

			if (penetrationX <= penetrationY && penetrationX <= penetrationZ) {
				penetrationDepth = penetrationX;
				normal.set(posA.x < posB.x ? -1 : 1, 0, 0);
			} else if (penetrationY <= penetrationX && penetrationY <= penetrationZ) {
				penetrationDepth = penetrationY;
				normal.set(0, posA.y < posB.y ? -1 : 1, 0);
			} else {
				penetrationDepth = penetrationZ;
				normal.set(0, 0, posA.z < posB.z ? -1 : 1);
			}

			return {
				colliding: true,
				penetrationDepth,
				normal,
			};
		}

		return { colliding: false };
	}

	// Sphere vs Box
	if (
		(colliderA.type === ColliderType.SPHERE && colliderB.type === ColliderType.BOX) ||
		(colliderA.type === ColliderType.BOX && colliderB.type === ColliderType.SPHERE)
	) {
		// Ensure A is the sphere and B is the box
		let spherePos: THREE.Vector3;
		let sphereRadius: number;
		let boxPos: THREE.Vector3;
		let boxHalfSize: THREE.Vector3;
		let swapped = false;

		if (colliderA.type === ColliderType.SPHERE) {
			spherePos = posA;
			sphereRadius = colliderA.radius;
			boxPos = posB;
			boxHalfSize = colliderB.size.clone().multiplyScalar(0.5);
		} else {
			spherePos = posB;
			sphereRadius = colliderB.radius;
			boxPos = posA;
			boxHalfSize = colliderA.size.clone().multiplyScalar(0.5);
			swapped = true;
		}

		// Calculate closest point on box to sphere center
		const closestPoint = new THREE.Vector3(
			Math.max(boxPos.x - boxHalfSize.x, Math.min(spherePos.x, boxPos.x + boxHalfSize.x)),
			Math.max(boxPos.y - boxHalfSize.y, Math.min(spherePos.y, boxPos.y + boxHalfSize.y)),
			Math.max(boxPos.z - boxHalfSize.z, Math.min(spherePos.z, boxPos.z + boxHalfSize.z))
		);

		// Calculate distance from sphere center to closest point
		const distance = spherePos.distanceTo(closestPoint);

		if (distance < sphereRadius) {
			// Calculate normal from closest point to sphere center
			const normal = new THREE.Vector3().subVectors(spherePos, closestPoint).normalize();

			// Flip normal if we swapped the order
			if (swapped) {
				normal.negate();
			}

			return {
				colliding: true,
				penetrationDepth: sphereRadius - distance,
				normal,
			};
		}

		return { colliding: false };
	}

	// Capsule vs Box or Sphere (simplify as sphere at top and bottom of capsule)
	if (colliderA.type === ColliderType.CAPSULE || colliderB.type === ColliderType.CAPSULE) {
		// Simplified capsule collision - not perfect but works for most cases
		// For capsule we'll test as two spheres (top and bottom) plus a cylinder

		// Ensure A is always the capsule for simplicity
		let capsulePos: THREE.Vector3;
		let capsuleRadius: number;
		let capsuleHeight: number;
		let otherPos: THREE.Vector3;
		let otherType: ColliderType;
		let otherRadius: number;
		let otherSize: THREE.Vector3;
		let swapped = false;

		if (colliderA.type === ColliderType.CAPSULE) {
			capsulePos = posA;
			capsuleRadius = colliderA.radius;
			capsuleHeight = colliderA.height;
			otherPos = posB;
			otherType = colliderB.type;
			otherRadius = colliderB.radius;
			otherSize = colliderB.size;
		} else {
			capsulePos = posB;
			capsuleRadius = colliderB.radius;
			capsuleHeight = colliderB.height;
			otherPos = posA;
			otherType = colliderA.type;
			otherRadius = colliderA.radius;
			otherSize = colliderA.size;
			swapped = true;
		}

		// Calculate top and bottom sphere positions
		const topSpherePos = new THREE.Vector3(capsulePos.x, capsulePos.y + capsuleHeight / 2, capsulePos.z);
		const bottomSpherePos = new THREE.Vector3(capsulePos.x, capsulePos.y - capsuleHeight / 2, capsulePos.z);

		// For sphere collisions
		if (otherType === ColliderType.SPHERE) {
			// Test top sphere
			const topDistance = topSpherePos.distanceTo(otherPos);
			if (topDistance < capsuleRadius + otherRadius) {
				const normal = new THREE.Vector3().subVectors(otherPos, topSpherePos).normalize();
				if (swapped) normal.negate();

				return {
					colliding: true,
					penetrationDepth: capsuleRadius + otherRadius - topDistance,
					normal,
				};
			}

			// Test bottom sphere
			const bottomDistance = bottomSpherePos.distanceTo(otherPos);
			if (bottomDistance < capsuleRadius + otherRadius) {
				const normal = new THREE.Vector3().subVectors(otherPos, bottomSpherePos).normalize();
				if (swapped) normal.negate();

				return {
					colliding: true,
					penetrationDepth: capsuleRadius + otherRadius - bottomDistance,
					normal,
				};
			}

			// Test cylinder - simplified
			// Project other sphere onto the capsule axis
			const axis = new THREE.Vector3(0, 1, 0);
			const otherToBottom = new THREE.Vector3().subVectors(otherPos, bottomSpherePos);
			const projection = otherToBottom.dot(axis);

			if (projection >= 0 && projection <= capsuleHeight) {
				// Calculate closest point on axis
				const closestOnAxis = new THREE.Vector3(
					bottomSpherePos.x,
					bottomSpherePos.y + projection,
					bottomSpherePos.z
				);

				// Calculate distance from sphere center to closest point on axis
				const distance = otherPos.distanceTo(closestOnAxis);

				if (distance < capsuleRadius + otherRadius) {
					const normal = new THREE.Vector3().subVectors(otherPos, closestOnAxis).normalize();
					if (swapped) normal.negate();

					return {
						colliding: true,
						penetrationDepth: capsuleRadius + otherRadius - distance,
						normal,
					};
				}
			}
		}

		// For box collisions - simplified approach
		if (otherType === ColliderType.BOX) {
			// Get half size
			const halfSize = otherSize.clone().multiplyScalar(0.5);

			// Test top sphere vs box
			const closestTop = new THREE.Vector3(
				Math.max(otherPos.x - halfSize.x, Math.min(topSpherePos.x, otherPos.x + halfSize.x)),
				Math.max(otherPos.y - halfSize.y, Math.min(topSpherePos.y, otherPos.y + halfSize.y)),
				Math.max(otherPos.z - halfSize.z, Math.min(topSpherePos.z, otherPos.z + halfSize.z))
			);

			const topDistance = topSpherePos.distanceTo(closestTop);
			if (topDistance < capsuleRadius) {
				const normal = new THREE.Vector3().subVectors(topSpherePos, closestTop).normalize();
				if (swapped) normal.negate();

				return {
					colliding: true,
					penetrationDepth: capsuleRadius - topDistance,
					normal,
				};
			}

			// Test bottom sphere vs box
			const closestBottom = new THREE.Vector3(
				Math.max(otherPos.x - halfSize.x, Math.min(bottomSpherePos.x, otherPos.x + halfSize.x)),
				Math.max(otherPos.y - halfSize.y, Math.min(bottomSpherePos.y, otherPos.y + halfSize.y)),
				Math.max(otherPos.z - halfSize.z, Math.min(bottomSpherePos.z, otherPos.z + halfSize.z))
			);

			const bottomDistance = bottomSpherePos.distanceTo(closestBottom);
			if (bottomDistance < capsuleRadius) {
				const normal = new THREE.Vector3().subVectors(bottomSpherePos, closestBottom).normalize();
				if (swapped) normal.negate();

				return {
					colliding: true,
					penetrationDepth: capsuleRadius - bottomDistance,
					normal,
				};
			}
		}

		return { colliding: false };
	}

	// Default case: no collision detected
	return { colliding: false };
}

/**
 * Process all potential collisions and apply responses
 * @param potentialCollisions Array of potential collision pairs
 * @param world World instance
 */
function processCollisions(potentialCollisions: CollisionPair[], world: World) {
	// Process each potential collision
	for (const { entityA, entityB } of potentialCollisions) {
		const transformA = entityA.get(Transform);
		const transformB = entityB.get(Transform);
		const colliderA = entityA.get(Collider);
		const colliderB = entityB.get(Collider);

		if (!transformA || !transformB || !colliderA || !colliderB) {
			continue;
		}

		// Check if layers should interact (using collision masks)
		if (!(colliderA.layer & colliderB.mask) || !(colliderB.layer & colliderA.mask)) {
			continue;
		}

		// Check for actual collision
		const collisionResult = testCollision(transformA, transformB, colliderA, colliderB);

		if (collisionResult.colliding) {
			// Record the collision for handling enter/stay/exit events
			recordCollision(entityA.id(), entityB.id());

			// Skip physical response if either is a trigger
			if (colliderA.isTrigger || colliderB.isTrigger) {
				continue;
			}

			// Only if we have penetration depth and normal
			if (collisionResult.penetrationDepth && collisionResult.normal) {
				// Share the penetration between both objects
				const halfPenetration = collisionResult.penetrationDepth * 0.5;

				// Update transforms to separate the objects
				const newPositionA = transformA.position
					.clone()
					.sub(collisionResult.normal.clone().multiplyScalar(halfPenetration));

				const newPositionB = transformB.position
					.clone()
					.add(collisionResult.normal.clone().multiplyScalar(halfPenetration));

				// Create new transform objects with updated positions
				entityA.set(Transform, {
					position: newPositionA,
					rotation: transformA.rotation,
					scale: transformA.scale,
				});

				entityB.set(Transform, {
					position: newPositionB,
					rotation: transformB.rotation,
					scale: transformB.scale,
				});
			}
		}
	}
}

/**
 * Record a collision between two entities
 * @param entityIdA ID of first entity
 * @param entityIdB ID of second entity
 */
function recordCollision(entityIdA: number, entityIdB: number) {
	// Ensure we have sets for both entities
	if (!currentCollisions.has(entityIdA)) {
		currentCollisions.set(entityIdA, new Set<number>());
	}

	if (!currentCollisions.has(entityIdB)) {
		currentCollisions.set(entityIdB, new Set<number>());
	}

	// Record the collision in both sets
	currentCollisions.get(entityIdA)!.add(entityIdB);
	currentCollisions.get(entityIdB)!.add(entityIdA);
}

/**
 * Update collision events (enter/stay/exit) based on current and previous collision state
 * @param world World instance
 */
function updateCollisionEvents(world: World) {
	// Process collision events for all entities with CollisionEvents
	const eventsQuery = world.query(CollisionEvents);

	eventsQuery.forEach((entity) => {
		const collisionEvents = entity.get(CollisionEvents);
		if (!collisionEvents) return;

		const collider = entity.get(Collider);
		const isTrigger = collider?.isTrigger || false;

		// Get current collisions for this entity
		const entityCollisions = currentCollisions.get(entity.id()) || new Set<number>();

		// Check for new collisions (collision enter)
		entityCollisions.forEach((otherId) => {
			// Find the other entity by checking all entities
			const otherEntity = world.query(CollisionEvents).find((e) => e.id() === otherId);

			if (!otherEntity) return;

			// Skip if already in contacts
			if (collisionEvents.contacts.has(otherId)) {
				// This is a 'stay' event
				if (isTrigger) {
					collisionEvents.onTriggerStay.forEach((callback) => callback(otherEntity));
				} else {
					collisionEvents.onCollisionStay.forEach((callback) => callback(otherEntity));
				}
			} else {
				// This is an 'enter' event
				collisionEvents.contacts.add(otherId);

				if (isTrigger) {
					collisionEvents.onTriggerEnter.forEach((callback) => callback(otherEntity));
				} else {
					collisionEvents.onCollisionEnter.forEach((callback) => callback(otherEntity));
				}
			}
		});

		// Check for ended collisions (collision exit)
		const endedCollisions: number[] = [];
		collisionEvents.contacts.forEach((otherId) => {
			if (!entityCollisions.has(otherId)) {
				// This collision has ended
				endedCollisions.push(otherId);

				// Find the other entity by checking all entities
				const otherEntity = world.query(CollisionEvents).find((e) => e.id() === otherId);

				if (!otherEntity) return;

				if (isTrigger) {
					collisionEvents.onTriggerExit.forEach((callback) => callback(otherEntity));
				} else {
					collisionEvents.onCollisionExit.forEach((callback) => callback(otherEntity));
				}
			}
		});

		// Remove ended collisions from contacts
		endedCollisions.forEach((otherId) => {
			collisionEvents.contacts.delete(otherId);
		});
	});

	// Clear current collisions for the next frame
	currentCollisions.clear();
}

/**
 * Helper function to find an entity by ID
 * @param world World instance
 * @param id Entity ID to find
 * @returns Entity or undefined if not found
 */
function findEntityById(world: World, id: number) {
	world.query().find((e) => e.id() === id);
}
