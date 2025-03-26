import { World } from 'koota';
import * as THREE from 'three';
import { Movement, Transform, TransformType } from '../traits';
import { Collider, ColliderInstanceType, ColliderType, CollisionEvents } from '../traits/collider';
import { PhysicsBody } from '../traits/physics-body';
import { CollisionPair, SpatialHashGrid } from '../utils/spatial-hash-grid';

// Constants
const SPATIAL_HASH_CELL_SIZE = 5; // Size of the cells in the spatial hash grid
const EXTRA_SEPARATION = 0; // Additional Separation for penetration resolution

// Reusable vectors to avoid allocations
const tempVecA = new THREE.Vector3();
const tempVecB = new THREE.Vector3();

// Used to track current collisions for collision events
const currentCollisions = new Map<number, Set<number>>();

// Reusable spatial hash grid for broadphase collision detection
const spatialGrid = new SpatialHashGrid(SPATIAL_HASH_CELL_SIZE);

export function collisionSystem(world: World) {
	// Clear the spatial hash grid for this frame
	spatialGrid.clear();

	// Get all entities with Transform and Collider for collision detection
	const colliderQuery = world.query(Transform, Collider);

	// Step 1: Prepare for collision detection
	// Update the spatial hash grid with all entities that have colliders
	colliderQuery.forEach((entity) => {
		const transform = entity.get(Transform);
		const collider = entity.get(Collider);

		if (!transform || !collider) return;

		// Insert entity into the spatial grid
		spatialGrid.insertEntity(entity, transform.position, collider);
	});

	// Step 2: Get potential collision pairs and process them
	const potentialCollisions = spatialGrid.getPotentialCollisions();
	processCollisions(potentialCollisions, world);

	// Step 3: Update collision events (enter/stay/exit)
	updateCollisionEvents(world);
}

/**
 * Tests if two entities are colliding based on their collider shapes
 */
function testCollision(
	transformA: TransformType,
	transformB: TransformType,
	colliderA: ColliderInstanceType,
	colliderB: ColliderInstanceType
): {
	colliding: boolean;
	penetrationDepth?: number;
	normal?: THREE.Vector3;
} {
	// Apply collider offsets to positions
	const posA = tempVecA.copy(transformA.position).add(colliderA.offset);
	const posB = tempVecB.copy(transformB.position).add(colliderB.offset);

	// Sphere vs Sphere
	if (colliderA.type === ColliderType.SPHERE && colliderB.type === ColliderType.SPHERE) {
		const distance = posA.distanceTo(posB);
		const combinedRadius = colliderA.radius + colliderB.radius;

		if (distance < combinedRadius) {
			const penetrationDepth = combinedRadius - distance;

			let normal = tempVecA.copy(posB).sub(posA).normalize();
			// Normal on y axis if they are very close
			if (distance < 0.0001) {
				normal = new THREE.Vector3(0, 1, 0);
			}

			return { colliding: true, penetrationDepth, normal };
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
		// TODO: Take transform rotation and scale into account
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
				normal.set(posA.x < posB.x ? 1 : -1, 0, 0);
			} else if (penetrationY <= penetrationX && penetrationY <= penetrationZ) {
				penetrationDepth = penetrationY;
				normal.set(0, posA.y < posB.y ? 1 : -1, 0);
			} else {
				penetrationDepth = penetrationZ;
				normal.set(0, 0, posA.z < posB.z ? 1 : -1);
			}

			return { colliding: true, penetrationDepth, normal };
		}

		return { colliding: false };
	}

	// Capsule vs Box (using sphere-sweep test for capsule)
	if (
		(colliderA.type === ColliderType.CAPSULE && colliderB.type === ColliderType.BOX) ||
		(colliderA.type === ColliderType.BOX && colliderB.type === ColliderType.CAPSULE)
	) {
		// Ensure A is the capsule and B is the box
		let capsulePos: THREE.Vector3;
		let capsuleHeight: number;
		let capsuleRadius: number;
		let boxPos: THREE.Vector3;
		let boxSize: THREE.Vector3;

		if (colliderA.type === ColliderType.CAPSULE) {
			capsulePos = posA;
			capsuleHeight = colliderA.height;
			capsuleRadius = colliderA.radius;
			boxPos = posB;
			boxSize = colliderB.size;
		} else {
			capsulePos = posB;
			capsuleHeight = colliderB.height;
			capsuleRadius = colliderB.radius;
			boxPos = posA;
			boxSize = colliderA.size;
		}

		const capsuleHalfHeight = capsuleRadius + capsuleHeight / 2;

		// Calculate box half-size
		const halfSize = boxSize.clone().multiplyScalar(0.5);

		// Calculate the top and bottom center points of the capsule
		const capsuleTop = new THREE.Vector3(capsulePos.x, capsulePos.y + capsuleHalfHeight, capsulePos.z);
		const capsuleBottom = new THREE.Vector3(capsulePos.x, capsulePos.y - capsuleHalfHeight, capsulePos.z);

		// Calculate box min and max points
		const boxMin = new THREE.Vector3(boxPos.x - halfSize.x, boxPos.y - halfSize.y, boxPos.z - halfSize.z);
		const boxMax = new THREE.Vector3(boxPos.x + halfSize.x, boxPos.y + halfSize.y, boxPos.z + halfSize.z);

		// Find the closest point on the box to the capsule axis
		const closestPointInBox = new THREE.Vector3(
			Math.max(boxMin.x, Math.min(capsulePos.x, boxMax.x)),
			Math.max(boxMin.y, Math.min(capsulePos.y, boxMax.y)),
			Math.max(boxMin.z, Math.min(capsulePos.z, boxMax.z))
		);

		// Calculate the distance between the closest point and the capsule position
		const distance = closestPointInBox.distanceTo(capsulePos);

		// If the distance is less than the capsule radius, we have a collision
		if (distance < capsuleHalfHeight) {
			// Calculate normal and penetration depth
			const normal = new THREE.Vector3().subVectors(capsulePos, closestPointInBox).normalize();
			const penetrationDepth = capsuleHalfHeight - distance;

			return { colliding: true, penetrationDepth, normal };
		}

		return { colliding: false };
	}

	// Default case: no collision detected
	return { colliding: false };
}

/**
 * Process all potential collisions and apply responses
 */
function processCollisions(potentialCollisions: CollisionPair[], world: World) {
	for (const { entityA, entityB } of potentialCollisions) {
		const transformA = entityA.get(Transform);
		const transformB = entityB.get(Transform);
		const colliderA = entityA.get(Collider);
		const colliderB = entityB.get(Collider);
		const movementA = entityA.get(Movement);
		const movementB = entityB.get(Movement);

		if (!transformA || !transformB || !colliderA || !colliderB) {
			continue;
		}

		// Check if layers should interact (using collision masks)
		if (!(colliderA.layer & colliderB.mask) || !(colliderB.layer & colliderA.mask)) {
			continue;
		}

		// Regular collision test for other cases
		const { colliding, penetrationDepth, normal } = testCollision(
			transformA,
			transformB,
			colliderA,
			colliderB
		);

		if (colliding) {
			// Record the collision for handling enter/stay/exit events
			recordCollision(entityA.id(), entityB.id());

			// Skip physical response if either is a trigger
			if (colliderA.isTrigger || colliderB.isTrigger) {
				continue;
			}

			// Only if we have penetration depth and normal
			if (penetrationDepth && normal) {
				// Get physics bodies if available
				const physicsA = entityA.get(PhysicsBody);
				const physicsB = entityB.get(PhysicsBody);

				// Handle static objects (they don't move in collisions)
				const isAStatic = physicsA?.isStatic ?? false;
				const isBStatic = physicsB?.isStatic ?? false;

				// Calculate how to distribute the penetration correction
				let ratioA = 0.5;
				let ratioB = 0.5;

				// If one object is static, the other takes all the movement
				if (isAStatic && !isBStatic) {
					ratioA = 0;
					ratioB = 1;
				} else if (!isAStatic && isBStatic) {
					ratioA = 1;
					ratioB = 0;
				}

				// Calculate penetration resolution
				const totalCorrection = penetrationDepth + EXTRA_SEPARATION; // Small extra separation
				const correctionA = normal.clone().multiplyScalar(-totalCorrection * ratioA);
				const correctionB = normal.clone().multiplyScalar(totalCorrection * ratioB);

				// Apply corrections to positions
				if (!isAStatic) {
					const newPositionA = transformA.position.clone().add(correctionA);
					entityA.set(Transform, {
						position: newPositionA,
						rotation: transformA.rotation,
						scale: transformA.scale,
					});

					if (movementA) {
						const dot = movementA.velocity.dot(normal);

						if (dot < 0) {
							const normalVelocity = normal.clone().multiplyScalar(dot);
							movementA.velocity.sub(normalVelocity);
							entityA.set(Movement, movementA);
						}
					}

					// if (movementA) {
					// 	const normalVelocity = normal.clone().multiplyScalar(movementA.velocity.dot(normal));

					// 	if (normalVelocity.dot(normal) < 0) {
					// 		movementA.velocity.sub(normalVelocity);
					// 		entityA.set(Movement, movementA);
					// 	}
					// }
				}

				if (!isBStatic) {
					const newPositionB = transformB.position.clone().add(correctionB);
					entityB.set(Transform, {
						position: newPositionB,
						rotation: transformB.rotation,
						scale: transformB.scale,
					});

					if (movementB) {
						const dot = movementB.velocity.dot(normal);

						if (dot < 0) {
							const normalVelocity = normal.clone().multiplyScalar(dot);
							movementB.velocity.sub(normalVelocity);
							entityB.set(Movement, movementB);
						}
					}
				}
			}
		}
	}
}

/**
 * Record a collision between two entities
 */
function recordCollision(entityIdA: number, entityIdB: number) {
	if (!currentCollisions.has(entityIdA)) {
		currentCollisions.set(entityIdA, new Set<number>());
	}
	if (!currentCollisions.has(entityIdB)) {
		currentCollisions.set(entityIdB, new Set<number>());
	}
	currentCollisions.get(entityIdA)!.add(entityIdB);
	currentCollisions.get(entityIdB)!.add(entityIdA);
}

/**
 * Update collision events (enter/stay/exit) based on current and previous collision state
 */
function updateCollisionEvents(world: World) {
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
			const otherEntity = findEntityById(world, otherId);
			if (!otherEntity) return;

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
				endedCollisions.push(otherId);
				const otherEntity = findEntityById(world, otherId);
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
 */
function findEntityById(world: World, id: number) {
	return world.query(Transform, Collider).find((e) => e.id() === id);
}
