import { trait } from 'koota';
import * as THREE from 'three';

/**
 * Enum defining the supported collider shape types
 */
export enum ColliderType {
	BOX,
	CAPSULE,
	HEIGHTFIELD,
	SPHERE,
	DODECAHEDRON,
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

/**
 * Type for Collider instance
 * - type: The shape of the collider (SPHERE, BOX, or CAPSULE)
 * - layer: Collision layer this collider belongs to (for filtering)
 * - mask: Bitmask of layers this collider should interact with
 * - isTrigger: If true, detects collisions but doesn't prevent movement
 * - offset: Offset from the entity position
 * - friction: Friction coefficient (0-1) for physics responses
 * - restitution: Bounciness coefficient (0-1) for physics responses
 * - radius: Radius for SPHERE and CAPSULE colliders
 * - size: Dimensions for BOX and HEIGHTFIELD colliders
 * - height: Additional height for CAPSULE colliders (total height is 2*radius + height)
 * - heightData: HEIGHTFIELD data for terrain colliders
 * - resolution: Resolution of the HEIGHTFIELD grid
 * - minHeight: Minimum height for the HEIGHTFIELD collider
 * - maxHeight: Maximum height for the HEIGHTFIELD collider
 * - vertices: Specific to Dodecahedron colliders
 * - faceNormals: Specific to Dodecahedron colliders
 */
export type ColliderInstanceType = {
	// Common to all colliders
	type: ColliderType;
	layer: CollisionLayer;
	mask: number;
	isTrigger: boolean;
	offset: THREE.Vector3;
	friction: number;
	restitution: number;
	// Specific to certain Collider Types
	radius: number;
	size: THREE.Vector3;
	height: number;
	heightData?: Float32Array;
	resolution: number;
	minHeight: number;
	maxHeight: number;
	// Specific to Dodecahedron colliders
	vertices?: THREE.Vector3[];
	faceNormals?: THREE.Vector3[];
};

export const COLLIDER_DEFAULTS: ColliderInstanceType = {
	type: ColliderType.BOX,
	layer: CollisionLayer.DEFAULT,
	mask: CollisionLayer.ALL,
	isTrigger: false,
	offset: new THREE.Vector3(0, 0, 0),
	friction: 0.3,
	restitution: 0.1,
	radius: 0,
	size: new THREE.Vector3(1, 1, 1),
	height: 0,
	resolution: 0,
	minHeight: 0,
	maxHeight: 0,
};

/**
 * Collider trait for collision detection
 */
export const Collider = trait<() => ColliderInstanceType>(() => COLLIDER_DEFAULTS);

/**
 * Common options that apply to all collider types
 */
interface CommonColliderOptions {
	layer?: CollisionLayer;
	mask?: number;
	isTrigger?: boolean;
	offset?: THREE.Vector3;
	friction?: number;
	restitution?: number;
}

type SphereColliderOptions = CommonColliderOptions & Pick<ColliderInstanceType, 'radius'>;

type BoxColliderOptions = CommonColliderOptions & Pick<ColliderInstanceType, 'size'>;

type CapsuleColliderOptions = CommonColliderOptions & Pick<ColliderInstanceType, 'radius' | 'height'>;

type HeightfieldColliderOptions = CommonColliderOptions &
	Pick<ColliderInstanceType, 'size' | 'heightData' | 'resolution' | 'minHeight' | 'maxHeight'>;

type DodecahedronColliderOptions = CommonColliderOptions & {
	radius: number;
	size?: THREE.Vector3; // Make size optional for Dodecahedron since we'll use radius
};

/**
 * Creates a sphere collider with the specified radius
 * @param options Sphere collider configuration
 */
export function SphereCollider(options: SphereColliderOptions) {
	return Collider({
		...COLLIDER_DEFAULTS,
		type: ColliderType.SPHERE,
		...options,
	});
}

/**
 * Creates a box collider with the specified size
 * @param options Box collider configuration
 */
export function BoxCollider(options: BoxColliderOptions) {
	return Collider({
		...COLLIDER_DEFAULTS,
		type: ColliderType.BOX,
		...options,
	});
}

/**
 * Creates a capsule collider with the specified radius and height
 * @param options Capsule collider configuration
 */
export function CapsuleCollider(options: CapsuleColliderOptions) {
	return Collider({
		...COLLIDER_DEFAULTS,
		type: ColliderType.CAPSULE,
		...options,
	});
}

/**
 * Creates a heightfield collider for terrain
 * @param options Heightfield collider configuration
 */
export function HeightfieldCollider(options: HeightfieldColliderOptions) {
	return Collider({
		...COLLIDER_DEFAULTS,
		type: ColliderType.HEIGHTFIELD,
		...options,
	});
}

/**
 * Creates a dodecahedron collider with the specified radius
 * @param options Dodecahedron collider configuration
 */
export function DodecahedronCollider(options: DodecahedronColliderOptions) {
	// Calculate size based on radius for compatibility with existing code
	const size = options.size || new THREE.Vector3(options.radius * 2, options.radius * 2, options.radius * 2);
	const { radius, ...rest } = options;
	return Collider({
		...COLLIDER_DEFAULTS,
		type: ColliderType.DODECAHEDRON,
		radius,
		size, // Keep size for compatibility with spatial hash grid
		...rest,
	});
}
