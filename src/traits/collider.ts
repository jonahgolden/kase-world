import { Entity, trait } from 'koota';
import * as THREE from 'three';

/**
 * Enum defining the supported collider shape types
 */
export enum ColliderType {
	SPHERE,
	BOX,
	CAPSULE,
	HEIGHTFIELD,
}

/**
 * Enum of collision layers for filtering collisions
 * Each layer is a power of 2 to allow bitwise operations for collision masks
 */
export enum CollisionLayer {
	DEFAULT = 1, // 0001: Default layer for basic objects
	TERRAIN = 2, // 0010: Terrain and environment objects
	CHARACTER = 4, // 0100: Player character and NPCs
	TRIGGER = 8, // 1000: Trigger areas that don't cause physical responses
	PROJECTILE = 16, // 00010000: Projectiles like the baby's scream
	POWERUP = 32, // 00100000: Power-up items
	VEHICLE = 64, // 01000000: Vehicles
	ALL = 0xffffffff, // 11111111: All layers
}

// Type for collider instance
export type ColliderInstanceType = {
	type: ColliderType;
	radius: number;
	size: THREE.Vector3;
	height: number;
	offset: THREE.Vector3;
	isTrigger: boolean;
	layer: CollisionLayer;
	mask: number;
	friction: number;
	restitution: number;
	// Heightfield specific data
	heightData?: Float32Array; // Height values
	resolution: number; // Grid resolution
	minHeight: number;
	maxHeight: number;
};

export const COLLIDER_DEFAULTS: ColliderInstanceType = {
	type: ColliderType.SPHERE,
	radius: 0.5, // Radius for SPHERE and CAPSULE colliders
	size: new THREE.Vector3(1, 1, 1), // For BOX colliders
	height: 0, // Height of Cylinder for CAPSULE colliders
	offset: new THREE.Vector3(0, 0, 0), // Offset from entity position
	isTrigger: false, // If true, detects collisions but doesn't prevent movement
	layer: CollisionLayer.DEFAULT, // The layer this collider belongs to
	mask: CollisionLayer.ALL, // Collides with all layers by default
	friction: 0.3, // Friction coefficient (0-1)
	restitution: 0.1, // Bounciness coefficient (0-1)
	resolution: 1, // Default resolution for heightfield
	minHeight: 0,
	maxHeight: 0,
};

/**
 * Collider trait for collision detection
 * - type: The shape of the collider (SPHERE, BOX, or CAPSULE)
 * - radius: Radius for SPHERE and CAPSULE colliders
 * - size: Dimensions for BOX colliders
 * - height: Additional height for CAPSULE colliders (total height is 2*radius + height)
 * - offset: Offset from the entity position
 * - isTrigger: If true, detects collisions but doesn't prevent movement
 * - layer: Collision layer this collider belongs to (for filtering)
 * - mask: Bitmask of layers this collider should interact with
 * - friction: Friction coefficient (0-1) for physics responses
 * - restitution: Bounciness coefficient (0-1) for physics responses
 */
export const Collider = trait(() => COLLIDER_DEFAULTS);

type CollisionEventsSchema = {
	// Stores entity IDs for fast lookups
	contacts: Set<number>;

	// Callbacks for collision events
	onCollisionEnter: Set<(other: Entity) => void>;
	onCollisionStay: Set<(other: Entity) => void>;
	onCollisionExit: Set<(other: Entity) => void>;

	// Callbacks for trigger events
	onTriggerEnter: Set<(other: Entity) => void>;
	onTriggerStay: Set<(other: Entity) => void>;
	onTriggerExit: Set<(other: Entity) => void>;
};

/**
 * Trait to store collision events and callbacks
 */
export const CollisionEvents = trait<() => CollisionEventsSchema>(() => ({
	// Entities currently in contact with this entity (updated each frame)
	contacts: new Set<number>(), // Stores entity IDs for fast lookups

	// Callbacks for collision events
	onCollisionEnter: new Set<(other: Entity) => void>(),
	onCollisionStay: new Set<(other: Entity) => void>(),
	onCollisionExit: new Set<(other: Entity) => void>(),

	// Callbacks for trigger events
	onTriggerEnter: new Set<(other: Entity) => void>(),
	onTriggerStay: new Set<(other: Entity) => void>(),
	onTriggerExit: new Set<(other: Entity) => void>(),
}));

export const CollisionEventsWithDefaults = ({
	contacts = new Set<number>(),
	onCollisionEnter = new Set<(other: Entity) => void>(),
	onCollisionStay = new Set<(other: Entity) => void>(),
	onCollisionExit = new Set<(other: Entity) => void>(),
	onTriggerEnter = new Set<(other: Entity) => void>(),
	onTriggerStay = new Set<(other: Entity) => void>(),
	onTriggerExit = new Set<(other: Entity) => void>(),
}: Partial<CollisionEventsSchema>) =>
	CollisionEvents({
		contacts,
		onCollisionEnter,
		onCollisionStay,
		onCollisionExit,
		onTriggerEnter,
		onTriggerStay,
		onTriggerExit,
	});
