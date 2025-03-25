import { Entity, World } from 'koota';
import * as THREE from 'three';
import { Movement, Time, Transform } from '../traits';
import {
	Collider,
	ColliderInstanceType,
	ColliderType,
	CollisionEvents,
	CollisionLayer,
} from '../traits/collider';
import { PhysicsBody } from '../traits/physics-body';
import { CollisionPair, SpatialHashGrid } from '../utils/spatial-hash-grid';

// Physics constants
const GRAVITY = new THREE.Vector3(0, -9.8, 0);
const GROUND_LEVEL = 0; // For simple ground check
const SPATIAL_HASH_CELL_SIZE = 5; // Size of the cells in the spatial hash grid

// Reusable vectors to avoid allocations
const tempVec3 = new THREE.Vector3();
const tempVec3A = new THREE.Vector3();
const tempVec3B = new THREE.Vector3();

// Used to track current collisions for collision events
const currentCollisions = new Map<number, Set<number>>();

// Reusable spatial hash grid for broadphase collision detection
const spatialGrid = new SpatialHashGrid(SPATIAL_HASH_CELL_SIZE);

export function physicsSystem(world: World) {
	// Get the delta time from the world clock
	const time = world.get(Time);
	if (!time) return;

	const delta = time.delta;
	const currentTime = time.current;

	// Clear the spatial hash grid for this frame
	spatialGrid.clear();

	// Get all entities with Transform and Collider for collision detection
	const colliderQuery = world.query(Transform, Collider);

	// Step 1: Update all entities with physics
	world.query(Transform, Movement, PhysicsBody).forEach((entity) => {
		const transform = entity.get(Transform);
		const movement = entity.get(Movement);
		const physics = entity.get(PhysicsBody);

		if (!transform || !movement || !physics) return;

		// Skip static bodies
		if (physics.isStatic) return;

		// Store original values
		const originalState = {
			position: transform.position.clone(),
			velocity: movement.velocity.clone(),
		};

		// Apply accumulated forces
		if (!physics.isKinematic) {
			// Apply gravity if enabled and the object is not grounded
			if (physics.gravity && !physics.isGrounded) {
				tempVec3.copy(GRAVITY).multiplyScalar(physics.gravityScale * delta);
				movement.velocity.add(tempVec3);
			}

			// Apply accumulated forces (scaled by mass)
			const forces = physics.forces;
			tempVec3.copy(forces).divideScalar(physics.mass).multiplyScalar(delta);
			movement.velocity.add(tempVec3);

			// Reset forces after applying them
			forces.set(0, 0, 0);
		}

		// Apply drag (air resistance)
		const dragFactor = Math.pow(1 - physics.drag, delta * 60); // Scale drag by delta time
		movement.velocity.multiplyScalar(dragFactor);

		// Apply ground friction
		// Instead of only applying friction when grounded, we apply it all the time
		// so the player can move around in the air

		// Only apply friction to XZ plane (horizontal movement)
		const horizontalVelocity = new THREE.Vector3(movement.velocity.x, 0, movement.velocity.z);

		if (horizontalVelocity.lengthSq() > 0.001) {
			const frictionFactor = Math.pow(1 - physics.groundFriction, delta * 60);
			movement.velocity.x *= frictionFactor;
			movement.velocity.z *= frictionFactor;
		}

		// Enforce velocity constraints
		if (physics.constraints.x) movement.velocity.x = 0;
		if (physics.constraints.y) movement.velocity.y = 0;
		if (physics.constraints.z) movement.velocity.z = 0;

		// Enforce terminal velocity
		if (movement.velocity.length() > physics.terminalVelocity) {
			movement.velocity.normalize().multiplyScalar(physics.terminalVelocity);
		}

		// Calculate proposed new position based on velocity
		const newPosition = transform.position.clone();
		tempVec3.copy(movement.velocity).multiplyScalar(delta);
		newPosition.add(tempVec3);

		// For CHARACTER layer entities, perform swept collision test to prevent tunneling
		if (entity.has(Collider) && entity.get(Collider)?.layer === CollisionLayer.CHARACTER) {
			// Get this entity's collider
			const collider = entity.get(Collider)!;

			// Sweep test against all potential static objects
			const staticQuery = world.query(Transform, Collider, PhysicsBody).filter(
				(e) =>
					e.id() !== entity.id() &&
					e.get(PhysicsBody)?.isStatic &&
					// Make sure the collision layers match
					collider.layer & e.get(Collider)!.mask &&
					collider.mask & e.get(Collider)!.layer
			);

			// Perform simple raycasting along movement direction
			let closestHit = 1.0; // Represents the full movement
			const hitNormal = new THREE.Vector3();
			let hitEntity = null;

			for (const obstacle of staticQuery) {
				const obstacleTransform = obstacle.get(Transform)!;
				const obstacleCollider = obstacle.get(Collider)!;

				// Skip triggers
				if (obstacleCollider.isTrigger) continue;

				// Special check for TERRAIN layer to prevent tunneling
				if (obstacleCollider.layer === CollisionLayer.TERRAIN) {
					const result = sweepTestAgainstTerrain(
						transform.position,
						newPosition,
						collider.radius,
						obstacleTransform.position,
						obstacleCollider.size
					);

					if (result.hit && result.t < closestHit) {
						closestHit = result.t;
						hitNormal.copy(result.normal);
						hitEntity = obstacle;
					}
				}
			}

			// If we hit something, adjust position and velocity
			if (closestHit < 1.0) {
				// Move to the point of impact, slightly offset to avoid precision issues
				const movementVector = tempVec3.copy(newPosition).sub(transform.position);
				const safeT = Math.max(0, closestHit - 0.01); // Back up slightly to avoid intersecting

				// Update position to stop at the collision point
				newPosition.copy(transform.position).add(movementVector.multiplyScalar(safeT));

				// Register the collision for events
				if (hitEntity) {
					recordCollision(entity.id(), hitEntity.id());
				}

				// Reflect velocity off the hit surface for bouncing
				if (movement.velocity.dot(hitNormal) < 0) {
					// Project velocity onto hit normal
					const normalVelocity = hitNormal.clone().multiplyScalar(movement.velocity.dot(hitNormal));

					// Remove the normal component from velocity (makes character slide along walls)
					movement.velocity.sub(normalVelocity);

					// Apply a slight additional push away from walls
					const pushFactor = 0.02;
					tempVec3.copy(hitNormal).multiplyScalar(pushFactor);
					newPosition.add(tempVec3);
				}
			}
		}

		// Update position with the potentially adjusted position
		transform.position.copy(newPosition);

		// Ground detection - checks if entity is on ground or on top of objects
		const wasGrounded = physics.isGrounded;

		// Only do advanced ground detection for CHARACTER layer entities
		if (entity.has(Collider) && entity.get(Collider)?.layer === CollisionLayer.CHARACTER) {
			const collider = entity.get(Collider)!;

			// Check for ground contact using raycasting
			const groundContact = checkGroundContact(world, entity, transform, collider);

			if (groundContact.isGrounded) {
				// We're grounded - update physics state
				physics.isGrounded = true;
				physics.groundNormal.copy(groundContact.groundNormal);
				physics.lastGroundedTime = currentTime;

				// Only adjust position if we're sinking into the ground
				if (groundContact.groundY !== null) {
					const idealHeight = groundContact.groundY + collider.radius;

					// Only snap position if we're below where we should be (prevents bouncing)
					if (transform.position.y < idealHeight - 0.01) {
						transform.position.y = idealHeight;

						// If we were falling, handle landing
						if (movement.velocity.y < 0) {
							// Reflect velocity with energy loss (restitution)
							movement.velocity.y = -movement.velocity.y * physics.restitution;

							// If bounce is too small, just stop vertical movement
							if (Math.abs(movement.velocity.y) < 0.1) {
								movement.velocity.y = 0;
							}
						}
					}
				}
			} else {
				// Not grounded - in air
				physics.isGrounded = false;
			}
		} else {
			// Simple ground check for non-CHARACTER entities
			if (transform.position.y <= GROUND_LEVEL) {
				transform.position.y = GROUND_LEVEL;

				// If we were falling and hit the ground, apply bounce
				if (movement.velocity.y < 0) {
					// Reflect velocity with energy loss (restitution)
					movement.velocity.y = -movement.velocity.y * physics.restitution;

					// If bounce is too small, just stop
					if (Math.abs(movement.velocity.y) < 0.1) {
						movement.velocity.y = 0;
					}
				}

				physics.isGrounded = true;
				physics.lastGroundedTime = currentTime;
			} else {
				physics.isGrounded = false;
			}
		}

		// Update entity traits if they changed
		if (!originalState.position.equals(transform.position)) {
			entity.set(Transform, transform);
		}

		if (!originalState.velocity.equals(movement.velocity)) {
			entity.set(Movement, movement);
		}

		entity.set(PhysicsBody, physics);
	});

	// Step 2: Prepare for collision detection
	// Update the spatial hash grid with all entities that have colliders
	colliderQuery.forEach((entity) => {
		const transform = entity.get(Transform);
		const collider = entity.get(Collider);

		if (!transform || !collider) return;

		// Insert entity into the spatial grid
		spatialGrid.insertEntity(entity, transform.position, collider);
	});

	// Step 3: Get potential collision pairs and process them
	const potentialCollisions = spatialGrid.getPotentialCollisions();
	processCollisions(potentialCollisions, world);

	// Step 4: Update collision events (enter/stay/exit)
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

		// Get the closest point on the capsule line segment to the box center
		const boxToTop = capsuleTop.clone().sub(boxPos);
		const boxToBottom = capsuleBottom.clone().sub(boxPos);

		// Find the closest point on the capsule axis to the box center
		// This is a simplified approach - we'll check the endpoints and middle
		let closestPointOnCapsule;

		// Calculate box min and max points
		const boxMin = new THREE.Vector3(boxPos.x - halfSize.x, boxPos.y - halfSize.y, boxPos.z - halfSize.z);
		const boxMax = new THREE.Vector3(boxPos.x + halfSize.x, boxPos.y + halfSize.y, boxPos.z + halfSize.z);

		// Find the closest point on the box to the capsule axis
		// First, we'll create a point within the box that's closest to the capsule axis
		// This is done by clamping the capsule position to the box bounds
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

	// Now add a simplified approach for player-building collisions
	// Check if one of the entities is a player (CHARACTER layer) and the other is a building (TERRAIN layer)
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
			// We have a collision - now find the nearest face to determine the normal

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

			// Find the minimum penetration axis for the closest face
			const normal = new THREE.Vector3();
			let penetrationDepth = 0;

			if (penX <= penY && penX <= penZ) {
				// X-axis is the minimum penetration
				penetrationDepth = penX;
				// Determine sign based on which side of the box we're on
				// Check if we're closer to min or max X
				if (Math.abs(characterPos.x - expandedMin.x) < Math.abs(expandedMax.x - characterPos.x)) {
					normal.set(-1, 0, 0); // We're closer to min X
				} else {
					normal.set(1, 0, 0); // We're closer to max X
				}
			} else if (penY <= penX && penY <= penZ) {
				// Y-axis is the minimum penetration
				penetrationDepth = penY;
				// Determine sign based on which side of the box we're on
				if (Math.abs(characterPos.y - expandedMin.y) < Math.abs(expandedMax.y - characterPos.y)) {
					normal.set(0, -1, 0); // We're closer to min Y
				} else {
					normal.set(0, 1, 0); // We're closer to max Y
				}
			} else {
				// Z-axis is the minimum penetration
				penetrationDepth = penZ;
				// Determine sign based on which side of the box we're on
				if (Math.abs(characterPos.z - expandedMin.z) < Math.abs(expandedMax.z - characterPos.z)) {
					normal.set(0, 0, -1); // We're closer to min Z
				} else {
					normal.set(0, 0, 1); // We're closer to max Z
				}
			}

			// If we swapped, we need to flip the normal since it's from B to A
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

				// Special case for CHARACTER vs TERRAIN
				// Add a bit of extra separation to prevent getting stuck
				let extraSeparation = 0;
				if (
					(colliderA.layer === CollisionLayer.CHARACTER && colliderB.layer === CollisionLayer.TERRAIN) ||
					(colliderB.layer === CollisionLayer.CHARACTER && colliderA.layer === CollisionLayer.TERRAIN)
				) {
					extraSeparation = 0.01; // Small extra separation to prevent sticking
				}

				// Calculate penetration resolution with potential extra separation
				const totalCorrection = collisionResult.penetrationDepth + extraSeparation;
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

					// If it's a character, also adjust its velocity to prevent it from moving into obstacles
					// This helps with "sliding" along walls instead of getting stuck
					const movementA = entityA.get(Movement);
					if (movementA && colliderA.layer === CollisionLayer.CHARACTER) {
						// Calculate the component of velocity in the direction of the normal
						const normalVelocity = collisionResult.normal
							.clone()
							.multiplyScalar(movementA.velocity.dot(collisionResult.normal));

						// Remove the normal component from the velocity (prevents pushing into the wall)
						if (normalVelocity.dot(collisionResult.normal) < 0) {
							// Only if moving toward the wall
							movementA.velocity.sub(normalVelocity);

							// Update the movement trait
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

					// Apply the same velocity adjustment for the other entity if it's a character
					const movementB = entityB.get(Movement);
					if (movementB && colliderB.layer === CollisionLayer.CHARACTER) {
						// Calculate the component of velocity in the direction of the normal
						const normalVelocity = collisionResult.normal
							.clone()
							.negate()
							.multiplyScalar(movementB.velocity.dot(collisionResult.normal.clone().negate()));

						// Remove the normal component from the velocity
						if (normalVelocity.dot(collisionResult.normal.clone().negate()) < 0) {
							movementB.velocity.sub(normalVelocity);

							// Update the movement trait
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
			const otherEntity = findEntityById(world, otherId);
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

				// Find the other entity
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
 * @param world World instance
 * @param id Entity ID to find
 * @returns Entity or undefined if not found
 */
function findEntityById(world: World, id: number) {
	return world.query().find((e) => e.id() === id);
}

/**
 * Performs a swept test of a moving sphere against a box
 * @param startPos Starting position of the sphere (character)
 * @param endPos Ending position of the sphere (character)
 * @param radius Radius of the sphere (character)
 * @param boxPos Position of the box (building)
 * @param boxSize Size of the box (building)
 * @returns Hit result with t value (0-1) and normal
 */
function sweepTestAgainstTerrain(
	startPos: THREE.Vector3,
	endPos: THREE.Vector3,
	radius: number,
	boxPos: THREE.Vector3,
	boxSize: THREE.Vector3
): { hit: boolean; t: number; normal: THREE.Vector3 } {
	// Calculate half size of the box
	const halfSize = boxSize.clone().multiplyScalar(0.5);

	// Calculate the min/max extents of the box
	const boxMin = new THREE.Vector3(boxPos.x - halfSize.x, boxPos.y - halfSize.y, boxPos.z - halfSize.z);
	const boxMax = new THREE.Vector3(boxPos.x + halfSize.x, boxPos.y + halfSize.y, boxPos.z + halfSize.z);

	// Extend the box by the radius of the sphere
	const extBoxMin = boxMin.clone().sub(new THREE.Vector3(radius, radius, radius));
	const extBoxMax = boxMax.clone().add(new THREE.Vector3(radius, radius, radius));

	// Calculate the movement vector
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
		// We're already inside - find the nearest face to exit
		// Calculate distances to each face
		const dists = [
			Math.abs(startPos.x - extBoxMin.x), // Distance to min X face
			Math.abs(extBoxMax.x - startPos.x), // Distance to max X face
			Math.abs(startPos.y - extBoxMin.y), // Distance to min Y face
			Math.abs(extBoxMax.y - startPos.y), // Distance to max Y face
			Math.abs(startPos.z - extBoxMin.z), // Distance to min Z face
			Math.abs(extBoxMax.z - startPos.z), // Distance to max Z face
		];

		// Find minimum distance and corresponding normal
		const minIndex = dists.indexOf(Math.min(...dists));
		const normal = new THREE.Vector3();

		// Set normal based on the closest face
		switch (minIndex) {
			case 0:
				normal.set(-1, 0, 0);
				break; // Min X face
			case 1:
				normal.set(1, 0, 0);
				break; // Max X face
			case 2:
				normal.set(0, -1, 0);
				break; // Min Y face
			case 3:
				normal.set(0, 1, 0);
				break; // Max Y face
			case 4:
				normal.set(0, 0, -1);
				break; // Min Z face
			case 5:
				normal.set(0, 0, 1);
				break; // Max Z face
		}

		return { hit: true, t: 0, normal }; // We're starting inside, so t=0
	}

	// Calculate entry and exit times for each axis
	let tmin = -Infinity;
	let tmax = Infinity;
	const hitNormal = new THREE.Vector3();

	// Check X axis
	if (Math.abs(delta.x) < 1e-10) {
		// Moving parallel to this axis - check if outside the slab
		if (startPos.x < extBoxMin.x || startPos.x > extBoxMax.x) {
			return { hit: false, t: 1, normal: new THREE.Vector3() };
		}
	} else {
		// Calculate intersection times with X-axis slabs
		const invDeltaX = 1.0 / delta.x;
		let t1 = (extBoxMin.x - startPos.x) * invDeltaX;
		let t2 = (extBoxMax.x - startPos.x) * invDeltaX;

		// Swap if needed
		if (t1 > t2) {
			const temp = t1;
			t1 = t2;
			t2 = temp;
		}

		// Update closest hit
		if (t1 > tmin) {
			tmin = t1;
			hitNormal.set(delta.x < 0 ? 1 : -1, 0, 0);
		}
		tmax = Math.min(tmax, t2);

		// No intersection if we're outside the range [0,1]
		if (tmin > tmax || tmax < 0) {
			return { hit: false, t: 1, normal: new THREE.Vector3() };
		}
	}

	// Check Y axis
	if (Math.abs(delta.y) < 1e-10) {
		// Moving parallel to this axis - check if outside the slab
		if (startPos.y < extBoxMin.y || startPos.y > extBoxMax.y) {
			return { hit: false, t: 1, normal: new THREE.Vector3() };
		}
	} else {
		// Calculate intersection times with Y-axis slabs
		const invDeltaY = 1.0 / delta.y;
		let t1 = (extBoxMin.y - startPos.y) * invDeltaY;
		let t2 = (extBoxMax.y - startPos.y) * invDeltaY;

		// Swap if needed
		if (t1 > t2) {
			const temp = t1;
			t1 = t2;
			t2 = temp;
		}

		// Update closest hit
		if (t1 > tmin) {
			tmin = t1;
			hitNormal.set(0, delta.y < 0 ? 1 : -1, 0);
		}
		tmax = Math.min(tmax, t2);

		// No intersection if we're outside the range [0,1]
		if (tmin > tmax || tmax < 0) {
			return { hit: false, t: 1, normal: new THREE.Vector3() };
		}
	}

	// Check Z axis
	if (Math.abs(delta.z) < 1e-10) {
		// Moving parallel to this axis - check if outside the slab
		if (startPos.z < extBoxMin.z || startPos.z > extBoxMax.z) {
			return { hit: false, t: 1, normal: new THREE.Vector3() };
		}
	} else {
		// Calculate intersection times with Z-axis slabs
		const invDeltaZ = 1.0 / delta.z;
		let t1 = (extBoxMin.z - startPos.z) * invDeltaZ;
		let t2 = (extBoxMax.z - startPos.z) * invDeltaZ;

		// Swap if needed
		if (t1 > t2) {
			const temp = t1;
			t1 = t2;
			t2 = temp;
		}

		// Update closest hit
		if (t1 > tmin) {
			tmin = t1;
			hitNormal.set(0, 0, delta.z < 0 ? 1 : -1);
		}
		tmax = Math.min(tmax, t2);

		// No intersection if we're outside the range [0,1]
		if (tmin > tmax || tmax < 0) {
			return { hit: false, t: 1, normal: new THREE.Vector3() };
		}
	}

	// If we reach here, we have a hit
	// Only return the hit if it's within our movement range (0 to 1)
	if (tmin >= 0 && tmin <= 1) {
		return { hit: true, t: tmin, normal: hitNormal };
	}

	return { hit: false, t: 1, normal: new THREE.Vector3() };
}

/**
 * Checks if a character is supported by terrain/objects beneath it
 * This is used for ground detection so players can jump when standing on objects
 * @param world World instance
 * @param entity Entity to check
 * @param transform Transform of the entity
 * @param collider Collider of the entity
 * @param maxDistance Maximum distance to check below the entity
 * @returns Ground contact information
 */
function checkGroundContact(
	world: World,
	entity: Entity,
	transform: any,
	collider: ColliderInstanceType,
	maxDistance: number = 0.3 // How far below feet to check
): {
	isGrounded: boolean;
	groundNormal: THREE.Vector3;
	groundY: number | null;
} {
	// Default result
	const result = {
		isGrounded: false,
		groundNormal: new THREE.Vector3(0, 1, 0),
		groundY: null as number | null,
	};

	// First, handle the simple ground plane case
	if (transform.position.y - collider.radius <= GROUND_LEVEL + 0.001) {
		result.isGrounded = true;
		result.groundY = GROUND_LEVEL;
		return result;
	}

	// Cast a ray downward from the entity's position
	const rayStart = new THREE.Vector3(
		transform.position.x,
		transform.position.y - collider.radius + 0.05, // Start from bottom of collider with small offset
		transform.position.z
	);

	const rayDirection = new THREE.Vector3(0, -1, 0);

	// Get all potential ground objects
	const possibleGrounds = world.query(Transform, Collider, PhysicsBody).filter(
		(e) =>
			e.id() !== entity.id() &&
			e.get(PhysicsBody)?.isStatic &&
			// Only allow objects with terrain layer to be treated as ground
			e.get(Collider)?.layer === CollisionLayer.TERRAIN
	);

	// Check for intersection with each potential ground
	let closestHit = maxDistance;
	let closestGroundY: number | null = null;

	for (const groundObj of possibleGrounds) {
		const groundTransform = groundObj.get(Transform)!;
		const groundCollider = groundObj.get(Collider)!;

		// Skip triggers
		if (groundCollider.isTrigger) continue;

		// For now, we only handle box colliders as ground
		if (groundCollider.type === ColliderType.BOX) {
			// Calculate box half size
			const halfSize = groundCollider.size.clone().multiplyScalar(0.5);

			// Calculate the top face Y position of the box
			const topY = groundTransform.position.y + halfSize.y;

			// Check if the ray start is above the box
			if (rayStart.y > topY) {
				// Check if ray is within the box's XZ bounds
				const groundMinX = groundTransform.position.x - halfSize.x;
				const groundMaxX = groundTransform.position.x + halfSize.x;
				const groundMinZ = groundTransform.position.z - halfSize.z;
				const groundMaxZ = groundTransform.position.z + halfSize.z;

				if (
					rayStart.x >= groundMinX &&
					rayStart.x <= groundMaxX &&
					rayStart.z >= groundMinZ &&
					rayStart.z <= groundMaxZ
				) {
					// Calculate distance to the ground
					const distance = rayStart.y - topY;

					// If this ground is closer than any we've found so far
					if (distance < closestHit) {
						closestHit = distance;
						closestGroundY = topY;
					}
				}
			}
		}
	}

	// Check if we found a ground
	if (closestGroundY !== null && closestHit <= maxDistance) {
		result.isGrounded = true;
		result.groundY = closestGroundY;
	}

	return result;
}
