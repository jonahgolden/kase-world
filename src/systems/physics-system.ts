import { Entity, World } from 'koota';
import * as THREE from 'three';
import { Movement, Time, Transform } from '../traits';
import { Collider, ColliderInstanceType, ColliderType, CollisionLayer } from '../traits/collider';
import { PhysicsBody } from '../traits/physics-body';
import { sweepTestAgainstTerrain } from './collision-system';

// Physics constants
const GRAVITY = new THREE.Vector3(0, -9.8, 0);
const GROUND_LEVEL = 0; // For simple ground check

// Reusable vectors to avoid allocations
const tempVec3 = new THREE.Vector3();

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

export function physicsSystem(world: World) {
	// Get the delta time from the world clock
	const time = world.get(Time);
	if (!time) return;

	const delta = time.delta;
	const currentTime = time.current;

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
		// Only do advanced ground detection for CHARACTER layer entities
		if (entity.has(Collider) && entity.get(Collider)?.layer === CollisionLayer.CHARACTER) {
			const collider = entity.get(Collider)!;
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
}
