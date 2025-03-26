import { Entity, World } from 'koota';
import * as THREE from 'three';
import { Movement, Time, Transform } from '../traits';
import { Collider, ColliderInstanceType, CollisionLayer } from '../traits/collider';
import { PhysicsBody } from '../traits/physics-body';

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
		transform.position.y - collider.radius + 0.1, // Increased offset to prevent false negatives
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

		// Calculate box half size
		const halfSize = groundCollider.size.clone().multiplyScalar(0.5);

		// Calculate the top face Y position of the box
		const topY = groundTransform.position.y + halfSize.y;

		// Check if the ray start is above the box
		if (rayStart.y > topY) {
			// Check if ray is within the box's XZ bounds with a small margin
			const margin = 0.05; // Small margin to prevent edge cases
			const groundMinX = groundTransform.position.x - halfSize.x - margin;
			const groundMaxX = groundTransform.position.x + halfSize.x + margin;
			const groundMinZ = groundTransform.position.z - halfSize.z - margin;
			const groundMaxZ = groundTransform.position.z + halfSize.z + margin;

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
			// Apply gravity if enabled
			if (physics.gravity) {
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
		const horizontalVelocity = new THREE.Vector3(movement.velocity.x, 0, movement.velocity.z);

		if (horizontalVelocity.lengthSq() > 0.001) {
			// Apply stronger friction when grounded
			const frictionFactor = Math.pow(
				1 - (physics.isGrounded ? physics.groundFriction : physics.groundFriction * 0.5),
				delta * 60
			);
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

		// Update position
		transform.position.copy(newPosition);

		// Ground detection for CHARACTER layer entities
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
					if (transform.position.y < idealHeight) {
						transform.position.y = idealHeight;

						// Stop downward velocity when landing
						if (movement.velocity.y < 0) {
							movement.velocity.y = 0;
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
				physics.isGrounded = true;
				physics.lastGroundedTime = currentTime;

				// Stop downward velocity when landing
				if (movement.velocity.y < 0) {
					movement.velocity.y = 0;
				}
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
