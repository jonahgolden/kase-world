import { World } from 'koota';
import * as THREE from 'three';
import { Movement, Transform } from '../traits';
import {
	Collider,
	ColliderInstanceType,
	ColliderType,
	CollisionEvents,
	CollisionLayer,
} from '../traits/collider';
import { PhysicsBody } from '../traits/physics-body';
import { CollisionPair, SpatialHashGrid } from '../utils/spatial-hash-grid';

// Constants
const SPATIAL_HASH_CELL_SIZE = 5; // Size of the cells in the spatial hash grid

// Reusable vectors to avoid allocations
const tempVec3 = new THREE.Vector3();
const tempVec3A = new THREE.Vector3();
const tempVec3B = new THREE.Vector3();

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

	// Sphere vs Sphere
	if (colliderA.type === ColliderType.SPHERE && colliderB.type === ColliderType.SPHERE) {
		const distance = posA.distanceTo(posB);
		const combinedRadius = colliderA.radius + colliderB.radius;

		if (distance < combinedRadius) {
			const penetrationDepth = combinedRadius - distance;
			const normal =
				distance > 0.0001 ? tempVec3A.copy(posB).sub(posA).normalize() : new THREE.Vector3(0, 1, 0);

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

	// Capsule vs Box (using sphere-sweep test for capsule)
	if (
		(colliderA.type === ColliderType.CAPSULE && colliderB.type === ColliderType.BOX) ||
		(colliderA.type === ColliderType.BOX && colliderB.type === ColliderType.CAPSULE)
	) {
		// Ensure A is the capsule and B is the box
		let capsulePos: THREE.Vector3;
		let capsuleRadius: number;
		let capsuleHeight: number;
		let boxPos: THREE.Vector3;
		let boxSize: THREE.Vector3;
		let swapped = false;

		if (colliderA.type === ColliderType.CAPSULE) {
			capsulePos = posA;
			capsuleRadius = colliderA.radius;
			capsuleHeight = colliderA.height;
			boxPos = posB;
			boxSize = colliderB.size;
		} else {
			capsulePos = posB;
			capsuleRadius = colliderB.radius;
			capsuleHeight = colliderB.height;
			boxPos = posA;
			boxSize = colliderA.size;
			swapped = true;
		}

		// Calculate box half-size
		const halfSize = boxSize.clone().multiplyScalar(0.5);

		// Calculate the top and bottom center points of the capsule
		const capsuleTop = new THREE.Vector3(capsulePos.x, capsulePos.y + capsuleHeight / 2, capsulePos.z);
		const capsuleBottom = new THREE.Vector3(capsulePos.x, capsulePos.y - capsuleHeight / 2, capsulePos.z);

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
		if (distance < capsuleRadius) {
			// Calculate normal and penetration depth
			const normal = new THREE.Vector3().subVectors(capsulePos, closestPointInBox).normalize();
			const penetrationDepth = capsuleRadius - distance;

			// Flip normal if we swapped the order
			if (swapped) {
				normal.negate();
			}

			return {
				colliding: true,
				penetrationDepth,
				normal,
			};
		}

		return { colliding: false };
	}

	// Special case for CHARACTER vs TERRAIN
	if (
		(colliderA.layer === CollisionLayer.CHARACTER && colliderB.layer === CollisionLayer.TERRAIN) ||
		(colliderA.layer === CollisionLayer.TERRAIN && colliderB.layer === CollisionLayer.CHARACTER)
	) {
		// Ensure A is the character and B is the terrain
		let characterPos: THREE.Vector3;
		let characterRadius: number;
		let terrainPos: THREE.Vector3;
		let terrainSize: THREE.Vector3;
		let swapped = false;

		if (colliderA.layer === CollisionLayer.CHARACTER) {
			characterPos = posA;
			characterRadius = colliderA.radius;
			terrainPos = posB;
			terrainSize = colliderB.size;
		} else {
			characterPos = posB;
			characterRadius = colliderB.radius;
			terrainPos = posA;
			terrainSize = colliderA.size;
			swapped = true;
		}

		// Calculate terrain half-size
		const halfSize = terrainSize.clone().multiplyScalar(0.5);

		// Calculate the terrain bounds with expanded radius for the character
		const expandedMin = new THREE.Vector3(
			terrainPos.x - halfSize.x - characterRadius,
			terrainPos.y - halfSize.y - characterRadius,
			terrainPos.z - halfSize.z - characterRadius
		);
		const expandedMax = new THREE.Vector3(
			terrainPos.x + halfSize.x + characterRadius,
			terrainPos.y + halfSize.y + characterRadius,
			terrainPos.z + halfSize.z + characterRadius
		);

		// Check if character is within the expanded bounds
		if (
			characterPos.x >= expandedMin.x &&
			characterPos.x <= expandedMax.x &&
			characterPos.y >= expandedMin.y &&
			characterPos.y <= expandedMax.y &&
			characterPos.z >= expandedMin.z &&
			characterPos.z <= expandedMax.z
		) {
			// Calculate penetration along each axis
			const penX = Math.min(
				Math.abs(expandedMax.x - characterPos.x),
				Math.abs(characterPos.x - expandedMin.x)
			);
			const penY = Math.min(
				Math.abs(expandedMax.y - characterPos.y),
				Math.abs(characterPos.y - expandedMin.y)
			);
			const penZ = Math.min(
				Math.abs(expandedMax.z - characterPos.z),
				Math.abs(characterPos.z - expandedMin.z)
			);

			// Find the minimum penetration axis and calculate normal
			const normal = new THREE.Vector3();
			let penetrationDepth = 0;

			// Calculate center points
			const terrainCenter = new THREE.Vector3(terrainPos.x, terrainPos.y, terrainPos.z);
			const toCharacter = characterPos.clone().sub(terrainCenter);

			// Determine which face of the terrain box we're closest to
			const absX = Math.abs(toCharacter.x);
			const absY = Math.abs(toCharacter.y);
			const absZ = Math.abs(toCharacter.z);

			// Compare with half-size to determine which face we're closest to
			const ratioX = absX / (halfSize.x + characterRadius);
			const ratioY = absY / (halfSize.y + characterRadius);
			const ratioZ = absZ / (halfSize.z + characterRadius);

			// The axis with the ratio closest to 1 is the face we're nearest to
			if (ratioX >= ratioY && ratioX >= ratioZ) {
				penetrationDepth = penX;
				normal.set(Math.sign(toCharacter.x), 0, 0);
			} else if (ratioY >= ratioX && ratioY >= ratioZ) {
				penetrationDepth = penY;
				normal.set(0, Math.sign(toCharacter.y), 0);
			} else {
				penetrationDepth = penZ;
				normal.set(0, 0, Math.sign(toCharacter.z));
			}

			// If we're very close to an edge or corner, blend the normals
			const EDGE_THRESHOLD = 0.1;
			if (Math.abs(ratioX - ratioY) < EDGE_THRESHOLD) {
				normal.x = Math.sign(toCharacter.x);
				normal.y = Math.sign(toCharacter.y);
				normal.normalize();
			}
			if (Math.abs(ratioX - ratioZ) < EDGE_THRESHOLD) {
				normal.x = Math.sign(toCharacter.x);
				normal.z = Math.sign(toCharacter.z);
				normal.normalize();
			}
			if (Math.abs(ratioY - ratioZ) < EDGE_THRESHOLD) {
				normal.y = Math.sign(toCharacter.y);
				normal.z = Math.sign(toCharacter.z);
				normal.normalize();
			}

			if (swapped) {
				normal.negate();
			}

			return {
				colliding: true,
				penetrationDepth,
				normal,
			};
		}
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

		// Special handling for CHARACTER vs TERRAIN to prevent tunneling
		if (
			(colliderA.layer === CollisionLayer.CHARACTER && colliderB.layer === CollisionLayer.TERRAIN) ||
			(colliderB.layer === CollisionLayer.CHARACTER && colliderA.layer === CollisionLayer.TERRAIN)
		) {
			// Determine which is character and which is terrain
			const [characterEntity, terrainEntity] =
				colliderA.layer === CollisionLayer.CHARACTER ? [entityA, entityB] : [entityB, entityA];
			const characterTransform = characterEntity.get(Transform)!;
			const terrainTransform = terrainEntity.get(Transform)!;
			const characterCollider = characterEntity.get(Collider)!;
			const terrainCollider = terrainEntity.get(Collider)!;
			const characterMovement = characterEntity.get(Movement);

			// First handle any existing overlap
			const overlapResult = testCollision(
				characterTransform,
				terrainTransform,
				characterCollider,
				terrainCollider
			);

			if (overlapResult.colliding) {
				// Record collision for events
				recordCollision(characterEntity.id(), terrainEntity.id());

				// Push character out of terrain with a bit of extra separation
				const pushOutDistance = overlapResult.penetrationDepth! + 0.01;
				const pushOutVector = overlapResult.normal!.clone().multiplyScalar(pushOutDistance);
				const safePos = characterTransform.position.clone().add(pushOutVector);

				// Update position
				characterEntity.set(Transform, {
					position: safePos,
					rotation: characterTransform.rotation,
					scale: characterTransform.scale,
				});

				// Zero out velocity in the collision normal direction
				if (characterMovement) {
					const normal = overlapResult.normal!;
					const dot = characterMovement.velocity.dot(normal);
					if (dot < 0) {
						// Remove all velocity in the normal direction
						const normalVel = normal.clone().multiplyScalar(dot);
						characterMovement.velocity.sub(normalVel);

						// For vertical collisions, handle ground contact
						if (Math.abs(normal.y) > 0.7) {
							characterMovement.velocity.y = 0;
						}

						// For horizontal collisions, prevent any movement into the wall
						if (Math.abs(normal.x) > 0.7) {
							characterMovement.velocity.x = 0;
						}
						if (Math.abs(normal.z) > 0.7) {
							characterMovement.velocity.z = 0;
						}

						characterEntity.set(Movement, characterMovement);
					}
				}

				// Skip further collision checks since we've handled the overlap
				continue;
			}

			// Then check for potential future collisions if we're moving
			if (characterMovement && characterMovement.velocity.lengthSq() > 0) {
				// Calculate the next position based on velocity
				const nextPos = characterTransform.position
					.clone()
					.add(characterMovement.velocity.clone().multiplyScalar(1 / 60));

				// Perform swept test
				const sweepResult = sweepTestAgainstTerrain(
					characterTransform.position,
					nextPos,
					characterCollider.radius,
					terrainTransform.position,
					terrainCollider.size
				);

				if (sweepResult.hit) {
					// Record collision for events
					recordCollision(characterEntity.id(), terrainEntity.id());

					// Calculate the safe position
					const safeT = Math.max(0, sweepResult.t - 0.01);
					const safePos = characterTransform.position.clone().lerp(nextPos, safeT);

					// Update position
					characterEntity.set(Transform, {
						position: safePos,
						rotation: characterTransform.rotation,
						scale: characterTransform.scale,
					});

					// Completely stop movement in the collision normal direction
					if (characterMovement) {
						const normal = sweepResult.normal;
						const dot = characterMovement.velocity.dot(normal);
						if (dot < 0) {
							// Remove all velocity in the normal direction
							const normalVel = normal.clone().multiplyScalar(dot);
							characterMovement.velocity.sub(normalVel);

							// For vertical collisions, handle ground contact
							if (Math.abs(normal.y) > 0.7) {
								if (normal.y > 0) {
									// Ground collision
									characterMovement.velocity.y = Math.max(0, characterMovement.velocity.y);
								} else {
									// Ceiling collision
									characterMovement.velocity.y = Math.min(0, characterMovement.velocity.y);
								}
							}

							// For horizontal collisions, prevent any movement into the wall
							if (Math.abs(normal.x) > 0.7) {
								characterMovement.velocity.x = 0;
							}
							if (Math.abs(normal.z) > 0.7) {
								characterMovement.velocity.z = 0;
							}

							characterEntity.set(Movement, characterMovement);
						}
					}

					// Skip regular collision test since we handled it here
					continue;
				}
			}
		}

		// Regular collision test for other cases
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
				// Get physics bodies if available
				const physicsA = entityA.get(PhysicsBody);
				const physicsB = entityB.get(PhysicsBody);

				// Handle static objects (they don't move in collisions)
				const isAStatic = physicsA?.isStatic || false;
				const isBStatic = physicsB?.isStatic || false;

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
				const totalCorrection = collisionResult.penetrationDepth + 0.01; // Small extra separation
				const correctionA = collisionResult.normal.clone().multiplyScalar(-totalCorrection * ratioA);
				const correctionB = collisionResult.normal.clone().multiplyScalar(totalCorrection * ratioB);

				// Apply corrections to positions
				if (!isAStatic) {
					const newPositionA = transformA.position.clone().add(correctionA);
					entityA.set(Transform, {
						position: newPositionA,
						rotation: transformA.rotation,
						scale: transformA.scale,
					});

					if (movementA) {
						const normalVelocity = collisionResult.normal
							.clone()
							.multiplyScalar(movementA.velocity.dot(collisionResult.normal));

						if (normalVelocity.dot(collisionResult.normal) < 0) {
							movementA.velocity.sub(normalVelocity);
							entityA.set(Movement, movementA);
						}
					}
				}

				if (!isBStatic) {
					const newPositionB = transformB.position.clone().add(correctionB);
					entityB.set(Transform, {
						position: newPositionB,
						rotation: transformB.rotation,
						scale: transformB.scale,
					});

					if (movementB) {
						const normalVelocity = collisionResult.normal
							.clone()
							.negate()
							.multiplyScalar(movementB.velocity.dot(collisionResult.normal.clone().negate()));

						if (normalVelocity.dot(collisionResult.normal.clone().negate()) < 0) {
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
	return world.query().find((e) => e.id() === id);
}

/**
 * Performs a swept test of a moving sphere against a box
 */
export function sweepTestAgainstTerrain(
	startPos: THREE.Vector3,
	endPos: THREE.Vector3,
	radius: number,
	boxPos: THREE.Vector3,
	boxSize: THREE.Vector3
): { hit: boolean; t: number; normal: THREE.Vector3 } {
	const halfSize = boxSize.clone().multiplyScalar(0.5);
	const boxMin = new THREE.Vector3(boxPos.x - halfSize.x, boxPos.y - halfSize.y, boxPos.z - halfSize.z);
	const boxMax = new THREE.Vector3(boxPos.x + halfSize.x, boxPos.y + halfSize.y, boxPos.z + halfSize.z);
	const extBoxMin = boxMin.clone().sub(new THREE.Vector3(radius, radius, radius));
	const extBoxMax = boxMax.clone().add(new THREE.Vector3(radius, radius, radius));
	const delta = new THREE.Vector3().subVectors(endPos, startPos);

	// Check if starting point is already inside the expanded box
	if (
		startPos.x >= extBoxMin.x &&
		startPos.x <= extBoxMax.x &&
		startPos.y >= extBoxMin.y &&
		startPos.y <= extBoxMax.y &&
		startPos.z >= extBoxMin.z &&
		startPos.z <= extBoxMax.z
	) {
		const dists = [
			Math.abs(startPos.x - extBoxMin.x),
			Math.abs(extBoxMax.x - startPos.x),
			Math.abs(startPos.y - extBoxMin.y),
			Math.abs(extBoxMax.y - startPos.y),
			Math.abs(startPos.z - extBoxMin.z),
			Math.abs(extBoxMax.z - startPos.z),
		];

		const minIndex = dists.indexOf(Math.min(...dists));
		const normal = new THREE.Vector3();

		switch (minIndex) {
			case 0:
				normal.set(-1, 0, 0);
				break;
			case 1:
				normal.set(1, 0, 0);
				break;
			case 2:
				normal.set(0, -1, 0);
				break;
			case 3:
				normal.set(0, 1, 0);
				break;
			case 4:
				normal.set(0, 0, -1);
				break;
			case 5:
				normal.set(0, 0, 1);
				break;
		}

		return { hit: true, t: 0, normal };
	}

	// Calculate entry and exit times for each axis
	let tmin = -Infinity;
	let tmax = Infinity;
	const hitNormal = new THREE.Vector3();

	// Check each axis (X, Y, Z)
	for (const axis of ['x', 'y', 'z'] as const) {
		if (Math.abs(delta[axis]) < 1e-10) {
			if (startPos[axis] < extBoxMin[axis] || startPos[axis] > extBoxMax[axis]) {
				return { hit: false, t: 1, normal: new THREE.Vector3() };
			}
		} else {
			const invDelta = 1.0 / delta[axis];
			let t1 = (extBoxMin[axis] - startPos[axis]) * invDelta;
			let t2 = (extBoxMax[axis] - startPos[axis]) * invDelta;

			if (t1 > t2) {
				[t1, t2] = [t2, t1];
			}

			if (t1 > tmin) {
				tmin = t1;
				hitNormal.set(0, 0, 0);
				hitNormal[axis] = delta[axis] < 0 ? 1 : -1;
			}
			tmax = Math.min(tmax, t2);

			if (tmin > tmax || tmax < 0) {
				return { hit: false, t: 1, normal: new THREE.Vector3() };
			}
		}
	}

	if (tmin >= 0 && tmin <= 1) {
		return { hit: true, t: tmin, normal: hitNormal };
	}

	return { hit: false, t: 1, normal: new THREE.Vector3() };
}
