import { Entity, World } from 'koota';
import * as THREE from 'three';
import { PHYSICS } from '../../constants/physics';
import {
	Collider,
	ColliderInstanceType,
	CollisionEvents,
	Movement,
	Transform,
	TransformType,
} from '../../traits';
import { CollisionState, CollisionStateUtils } from '../../traits/collision-state';
import { PhysicsBody, PhysicsBodyInstanceType } from '../../traits/physics-body';
import { SpatialHashGrid } from '../../utils/spatial-hash-grid';
import { findEntityById } from './helpers';
import { collisionStrategyManager } from './strategies/strategy-manager';
import { calculateCollisionResponse } from './utils/collision-response';

// Constants
const SPATIAL_HASH_CELL_SIZE = 5; // Size of the cells in the spatial hash grid
const EXTRA_SEPARATION = PHYSICS.COLLISION.EXTRA_SEPARATION;
const MAX_COLLISION_ITERATIONS = PHYSICS.COLLISION.MAX_ITERATIONS;
const BASE_CORRECTION_SCALE = PHYSICS.COLLISION.CORRECTION_SCALE;
const CORRECTION_FALLOFF = PHYSICS.COLLISION.CORRECTION_FALLOFF;
const tempQuaternion = new THREE.Quaternion();

// Reusable spatial hash grid for broadphase collision detection
const spatialGrid = new SpatialHashGrid(SPATIAL_HASH_CELL_SIZE);

// Add reusable vectors at the top with other constants
const tempImpulse = new THREE.Vector3();
const tempFrictionImpulse = new THREE.Vector3();
const tempRelativeVelocity = new THREE.Vector3();
const tempTangent = new THREE.Vector3();

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
		physics?: PhysicsBodyInstanceType;
		collider: ColliderInstanceType;
	};
	entityB: {
		entity: Entity;
		transform: TransformType;
		movement?: MovementInstance;
		physics?: PhysicsBodyInstanceType;
		collider: ColliderInstanceType;
	};
	normal: THREE.Vector3;
	penetrationDepth: number;
	iterationScale: number;
	impulse?: THREE.Vector3;
	frictionImpulse?: THREE.Vector3;
}

/**
 * Main collision detection and response system
 * Handles:
 * - Broad phase collision detection using spatial hash
 * - Narrow phase collision detection using shape-specific checks
 * - Collision response (position correction and impulse)
 * - Collision event dispatch
 */
export function collisionSystem(world: World) {
	// Get or create collision state
	let collisionState = world.get(CollisionState);
	if (!collisionState) {
		world.add(CollisionState());
		collisionState = world.get(CollisionState);
	}
	if (!collisionState) return; // Safety check

	// Clear previous frame's collisions
	CollisionStateUtils.clearCollisions(collisionState);

	// Prepare spatial hash grid for broad phase
	spatialGrid.clear();
	world.query(Transform, Collider).forEach((entity) => {
		const transform = entity.get(Transform);
		const collider = entity.get(Collider);
		if (transform && collider) {
			spatialGrid.insertEntity(entity, transform.position, collider);
		}
	});

	// Get potential collisions from spatial hash
	const potentialCollisions = spatialGrid.getPotentialCollisions();

	// Process collisions
	for (let iteration = 0; iteration < MAX_COLLISION_ITERATIONS; iteration++) {
		let hasCollision = false;

		for (const { entityA: entA, entityB: entB } of potentialCollisions) {
			const transformA = entA.get(Transform);
			const transformB = entB.get(Transform);
			const colliderA = entA.get(Collider);
			const colliderB = entB.get(Collider);

			if (!transformA || !transformB || !colliderA || !colliderB) {
				continue;
			}

			// Check if layers should interact (using collision masks)
			if (!(colliderA.layer & colliderB.mask) || !(colliderB.layer & colliderA.mask)) {
				continue;
			}

			// Use the current collision strategy to check for collision
			const result = collisionStrategyManager.getCurrentHandler().checkCollision({
				transformA,
				colliderA,
				transformB,
				colliderB,
			});

			const colliding = result !== null;

			if (colliding && result && result.normal && result.penetration) {
				hasCollision = true;

				// Record the collision in our CollisionState
				CollisionStateUtils.recordCollision(collisionState, entA.id(), entB.id());

				// Skip physical response if either is a trigger
				if (colliderA.isTrigger || colliderB.isTrigger) {
					continue;
				}

				// Get physics bodies if available
				const physicsA = entA.get(PhysicsBody);
				const physicsB = entB.get(PhysicsBody);

				// Get movement components if available
				const movementA = entA.get(Movement);
				const movementB = entB.get(Movement);

				const iterationScale = BASE_CORRECTION_SCALE * Math.pow(iteration + 1, -CORRECTION_FALLOFF);

				// Calculate collision response with impulse and friction
				const updatedResult = calculateCollisionResponse(
					result,
					{
						movement: movementA,
						physics: physicsA,
						restitution: colliderA.restitution,
						friction: colliderA.friction,
					},
					{
						movement: movementB,
						physics: physicsB,
						restitution: colliderB.restitution,
						friction: colliderB.friction,
					}
				);

				// Apply the collision response
				applyCollisionResponse({
					entityA: {
						entity: entA,
						transform: transformA,
						movement: movementA,
						physics: physicsA,
						collider: colliderA,
					},
					entityB: {
						entity: entB,
						transform: transformB,
						movement: movementB,
						physics: physicsB,
						collider: colliderB,
					},
					normal: updatedResult.normal,
					penetrationDepth: updatedResult.penetration,
					iterationScale,
					impulse: updatedResult.impulse,
					frictionImpulse: updatedResult.frictionImpulse,
				});
			}
		}

		// If no collisions were detected in this iteration, we can stop
		if (!hasCollision) break;
	}

	// Handle collision events
	world.query(CollisionEvents).forEach((entity) => {
		const events = entity.get(CollisionEvents);
		if (!events) return;

		const entityId = entity.id();
		const currentlyColliding = new Set(collisionState.currentCollisions.get(entityId) || []);

		// Handle collision enter/stay/exit events
		for (const otherId of currentlyColliding) {
			const otherEntity = findEntityById(world, otherId);
			if (!otherEntity) continue;

			if (!events.contacts.has(otherId)) {
				// Collision Enter
				events.onCollisionEnter.forEach((callback) => callback(otherEntity));
				events.contacts.add(otherId);
			} else {
				// Collision Stay
				events.onCollisionStay.forEach((callback) => callback(otherEntity));
			}
		}

		// Handle collision exit
		const endedCollisions: number[] = [];
		events.contacts.forEach((otherId) => {
			if (!currentlyColliding.has(otherId)) {
				const otherEntity = findEntityById(world, otherId);
				if (otherEntity) {
					events.onCollisionExit.forEach((callback) => callback(otherEntity));
				}
				endedCollisions.push(otherId);
			}
		});

		// Remove ended collisions
		endedCollisions.forEach((otherId) => {
			events.contacts.delete(otherId);
		});
	});
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
	impulse,
	frictionImpulse,
}: CollisionResponse) {
	// Regular collision response using physics constants
	const totalCorrection =
		(penetrationDepth + PHYSICS.COLLISION.EXTRA_SEPARATION) *
		PHYSICS.COLLISION.CORRECTION_SCALE *
		Math.pow(PHYSICS.COLLISION.CORRECTION_FALLOFF, iterationScale);

	// Calculate relative velocity for resting contact detection
	tempRelativeVelocity.set(0, 0, 0);
	if (entityA.movement) tempRelativeVelocity.sub(entityA.movement.velocity);
	if (entityB.movement) tempRelativeVelocity.add(entityB.movement.velocity);
	const normalVelocity = tempRelativeVelocity.dot(normal);

	// Detect if this is a resting contact using physics constant
	const isRestingContact = Math.abs(normalVelocity) < PHYSICS.RESTING.VELOCITY_THRESHOLD;

	// Calculate mass ratios for impulse distribution
	let ratioA = 0.5;
	let ratioB = 0.5;
	let massA = 1;
	let massB = 1;

	// If one object is static, the other takes all the movement
	if (entityA.physics?.isStatic && !entityB.physics?.isStatic) {
		ratioA = 0;
		ratioB = 1;
		massA = Infinity;
		massB = entityB.physics?.mass || 1;
	} else if (!entityA.physics?.isStatic && entityB.physics?.isStatic) {
		ratioA = 1;
		ratioB = 0;
		massA = entityA.physics?.mass || 1;
		massB = Infinity;
	} else if (entityA.physics && entityB.physics) {
		// If both objects have physics, distribute based on mass
		massA = entityA.physics.mass;
		massB = entityB.physics.mass;
		const totalMass = massA + massB;
		ratioA = massB / totalMass;
		ratioB = massA / totalMass;
	}

	// Apply immediate position correction
	const correctionA = normal.clone().multiplyScalar(-totalCorrection * ratioA);
	const correctionB = normal.clone().multiplyScalar(totalCorrection * ratioB);

	// Apply corrections and impulses to entityA
	if (!entityA.physics?.isStatic) {
		// Position correction
		const newPositionA = entityA.transform.position.clone().add(correctionA);
		entityA.entity.set(Transform, {
			position: newPositionA,
			rotation: entityA.transform.rotation,
			scale: entityA.transform.scale,
		});

		// Velocity update with impulse
		if (entityA.movement) {
			if (!isRestingContact && impulse) {
				entityA.movement.velocity.addScaledVector(impulse, -1 / massA);
				if (frictionImpulse) {
					entityA.movement.velocity.addScaledVector(frictionImpulse, -1 / massA);
				}
			} else if (isRestingContact) {
				// For resting contacts, zero out the velocity in the normal direction
				const dot = entityA.movement.velocity.dot(normal);
				const normalVel = normal.clone().multiplyScalar(dot);
				entityA.movement.velocity.sub(normalVel);
			}

			entityA.entity.set(Movement, entityA.movement);
		}
	}

	// Apply corrections and impulses to entityB
	if (!entityB.physics?.isStatic) {
		// Position correction
		const newPositionB = entityB.transform.position.clone().add(correctionB);
		entityB.entity.set(Transform, {
			position: newPositionB,
			rotation: entityB.transform.rotation,
			scale: entityB.transform.scale,
		});

		// Velocity update with impulse
		if (entityB.movement) {
			if (!isRestingContact && impulse) {
				entityB.movement.velocity.addScaledVector(impulse, 1 / massB);
				if (frictionImpulse) {
					entityB.movement.velocity.addScaledVector(frictionImpulse, 1 / massB);
				}
			} else if (isRestingContact) {
				// For resting contacts, zero out the velocity in the normal direction
				const dot = entityB.movement.velocity.dot(normal);
				const normalVel = normal.clone().multiplyScalar(dot);
				entityB.movement.velocity.sub(normalVel);
			}

			entityB.entity.set(Movement, entityB.movement);
		}
	}
}
