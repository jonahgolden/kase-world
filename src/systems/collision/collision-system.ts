import { Entity, World } from 'koota';
import * as THREE from 'three';
import {
	Collider,
	ColliderInstanceType,
	CollisionEvents,
	Movement,
	Transform,
	TransformType,
} from '../../traits';
import { PhysicsBody } from '../../traits/physics-body';
import { CollisionPair, SpatialHashGrid } from '../../utils/spatial-hash-grid';
import { checkCollision } from './checkers/check-collision';
import { findEntityById } from './helpers';

// Constants
const SPATIAL_HASH_CELL_SIZE = 5; // Size of the cells in the spatial hash grid
const EXTRA_SEPARATION = 0; // Additional Separation for penetration resolution
const MAX_COLLISION_ITERATIONS = 10; // Maximum number of collision resolution iterations
const BASE_CORRECTION_SCALE = 1.0; // Reduced from 2.0 to make corrections less aggressive
const CORRECTION_FALLOFF = 0.5; // How quickly correction reduces per iteration
const RESTING_VELOCITY_THRESHOLD = 0.1; // Threshold for considering a collision as a resting contact
const MIN_BOUNCE_VELOCITY = 0.2; // Minimum velocity required for bounce response
const VERTICAL_COLLISION_THRESHOLD = 0.7; // ~45 degree angle threshold for vertical collisions

// Used to track current collisions for collision events
const currentCollisions = new Map<number, Set<number>>();

// Reusable spatial hash grid for broadphase collision detection
const spatialGrid = new SpatialHashGrid(SPATIAL_HASH_CELL_SIZE);

// Type for Movement instance data
type MovementInstance = {
	velocity: THREE.Vector3;
	thrust: number;
	damping: number;
	force: THREE.Vector3;
};

interface CollisionResponse {
	entityA: {
		entity: Entity;
		transform: TransformType;
		movement?: MovementInstance;
		isStatic: boolean;
		collider: ColliderInstanceType; // Add collider to response
	};
	entityB: {
		entity: Entity;
		transform: TransformType;
		movement?: MovementInstance;
		isStatic: boolean;
		collider: ColliderInstanceType; // Add collider to response
	};
	normal: THREE.Vector3;
	penetrationDepth: number;
	iterationScale: number;
}

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
 * Process all potential collisions and apply responses
 */
function processCollisions(potentialCollisions: CollisionPair[], world: World) {
	for (let iteration = 0; iteration < MAX_COLLISION_ITERATIONS; iteration++) {
		let hasCollision = false;

		for (const { entityA: entA, entityB: entB } of potentialCollisions) {
			const transformA = entA.get(Transform);
			const transformB = entB.get(Transform);
			const colliderA = entA.get(Collider);
			const colliderB = entB.get(Collider);
			const movementA = entA.get(Movement);
			const movementB = entB.get(Movement);

			if (!transformA || !transformB || !colliderA || !colliderB) {
				continue;
			}

			// Check if layers should interact (using collision masks)
			if (!(colliderA.layer & colliderB.mask) || !(colliderB.layer & colliderA.mask)) {
				continue;
			}

			const result = checkCollision({ transformA, colliderA, transformB, colliderB });
			const colliding = result !== null;

			if (colliding && result && result.normal && result.penetration) {
				hasCollision = true;

				// Record the collision for handling enter/stay/exit events
				// Only record on first iteration to avoid duplicate events
				if (iteration === 0) {
					recordCollision(entA.id(), entB.id());
				}

				// Skip physical response if either is a trigger
				if (colliderA.isTrigger || colliderB.isTrigger) {
					continue;
				}

				// Get physics bodies if available
				const physicsA = entA.get(PhysicsBody);
				const physicsB = entB.get(PhysicsBody);

				const iterationScale = BASE_CORRECTION_SCALE * Math.pow(iteration + 1, -CORRECTION_FALLOFF);

				applyCollisionResponse({
					entityA: {
						entity: entA,
						transform: transformA,
						movement: movementA,
						isStatic: physicsA?.isStatic ?? false,
						collider: colliderA,
					},
					entityB: {
						entity: entB,
						transform: transformB,
						movement: movementB,
						isStatic: physicsB?.isStatic ?? false,
						collider: colliderB,
					},
					normal: result.normal,
					penetrationDepth: result.penetration,
					iterationScale,
				});
			}
		}

		// If no collisions were detected in this iteration, we can stop
		if (!hasCollision) break;
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
 * Apply collision response between two entities
 */
function applyCollisionResponse({
	entityA,
	entityB,
	normal,
	penetrationDepth,
	iterationScale,
}: CollisionResponse) {
	// Regular collision response
	const totalCorrection = (penetrationDepth + EXTRA_SEPARATION) * iterationScale;

	// Calculate relative velocity for resting contact detection
	const relativeVelocity = new THREE.Vector3();
	if (entityA.movement) relativeVelocity.sub(entityA.movement.velocity);
	if (entityB.movement) relativeVelocity.add(entityB.movement.velocity);
	const normalVelocity = relativeVelocity.dot(normal);

	// Detect if this is a resting contact
	const isRestingContact = Math.abs(normalVelocity) < RESTING_VELOCITY_THRESHOLD;

	// Calculate how to distribute the penetration correction
	let ratioA = 0.5;
	let ratioB = 0.5;

	// If one object is static, the other takes all the movement
	if (entityA.isStatic && !entityB.isStatic) {
		ratioA = 0;
		ratioB = 1;
	} else if (!entityA.isStatic && entityB.isStatic) {
		ratioA = 1;
		ratioB = 0;
	}

	// Apply immediate position correction
	const correctionA = normal.clone().multiplyScalar(-totalCorrection * ratioA);
	const correctionB = normal.clone().multiplyScalar(totalCorrection * ratioB);

	// Apply corrections to positions
	if (!entityA.isStatic) {
		const newPositionA = entityA.transform.position.clone().add(correctionA);
		entityA.entity.set(Transform, {
			position: newPositionA,
			rotation: entityA.transform.rotation,
			scale: entityA.transform.scale,
		});

		if (entityA.movement) {
			const dot = entityA.movement.velocity.dot(normal);
			if (dot < 0 && Math.abs(dot) > MIN_BOUNCE_VELOCITY) {
				// Only bounce if velocity is above threshold
				const normalVelocity = normal.clone().multiplyScalar(dot);
				entityA.movement.velocity.sub(normalVelocity);

				// Set isGrounded if vertical collision and low velocity
				const verticalCollision = Math.abs(normal.y) > VERTICAL_COLLISION_THRESHOLD;
				if (verticalCollision && Math.abs(entityA.movement.velocity.y) < RESTING_VELOCITY_THRESHOLD) {
					const physics = entityA.entity.get(PhysicsBody);
					if (physics) {
						physics.isGrounded = true;
						entityA.entity.set(PhysicsBody, physics);
					}
				}

				entityA.entity.set(Movement, entityA.movement);
			} else if (isRestingContact) {
				// For resting contacts, zero out the velocity in the normal direction
				const normalVel = normal.clone().multiplyScalar(dot);
				entityA.movement.velocity.sub(normalVel);
				entityA.entity.set(Movement, entityA.movement);
			}
		}
	}

	if (!entityB.isStatic) {
		const newPositionB = entityB.transform.position.clone().add(correctionB);
		entityB.entity.set(Transform, {
			position: newPositionB,
			rotation: entityB.transform.rotation,
			scale: entityB.transform.scale,
		});

		if (entityB.movement) {
			const dot = entityB.movement.velocity.dot(normal);
			if (dot < 0 && Math.abs(dot) > MIN_BOUNCE_VELOCITY) {
				// Only bounce if velocity is above threshold
				const normalVelocity = normal.clone().multiplyScalar(dot);
				entityB.movement.velocity.sub(normalVelocity);

				// Set isGrounded if vertical collision and low velocity
				const verticalCollision = Math.abs(normal.y) > VERTICAL_COLLISION_THRESHOLD;
				if (verticalCollision && Math.abs(entityB.movement.velocity.y) < RESTING_VELOCITY_THRESHOLD) {
					const physics = entityB.entity.get(PhysicsBody);
					if (physics) {
						physics.isGrounded = true;
						entityB.entity.set(PhysicsBody, physics);
					}
				}

				entityB.entity.set(Movement, entityB.movement);
			} else if (isRestingContact) {
				// For resting contacts, zero out the velocity in the normal direction
				const normalVel = normal.clone().multiplyScalar(dot);
				entityB.movement.velocity.sub(normalVel);
				entityB.entity.set(Movement, entityB.movement);
			}
		}
	}
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
