import { trait } from 'koota';
import * as THREE from 'three';
import { TransformType } from './transform';

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
 * - getSupportPoint: Support function for GJK algorithm
 * - getCenterPoint: Support function for GJK algorithm
 * - cachedGeometry: Cached geometry for optimization (optional)
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
	// Support functions for GJK algorithm
	getSupportPoint?: (direction: THREE.Vector3, transform: TransformType) => THREE.Vector3;
	getCenterPoint?: (transform: TransformType) => THREE.Vector3;
	// Cached geometry for optimization (optional)
	cachedGeometry?: {
		vertices: THREE.Vector3[];
		normals?: THREE.Vector3[];
		transformedVertices?: THREE.Vector3[];
		lastTransform?: TransformType;
	};
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
	// Calculate size based on radius for compatibility
	const size = options.size || new THREE.Vector3(options.radius * 2, options.radius * 2, options.radius * 2);
	const { radius, ...rest } = options;

	// Create vertices and face normals for the dodecahedron
	const vertices = createDodecahedronVertices(radius);
	const faceNormals = calculateDodecahedronFaceNormals(vertices);

	// Support function for GJK algorithm
	const getSupportPoint = (direction: THREE.Vector3, transform: TransformType): THREE.Vector3 => {
		// Cache transformed vertices for performance
		if (!transform.position || !transform.rotation || !transform.scale) {
			return new THREE.Vector3();
		}

		let furthestPoint = vertices[0].clone();
		let maxDot = direction.dot(applyTransform(furthestPoint, transform));

		for (let i = 1; i < vertices.length; i++) {
			const point = vertices[i].clone();
			const transformedPoint = applyTransform(point, transform);
			const dot = direction.dot(transformedPoint);
			if (dot > maxDot) {
				maxDot = dot;
				furthestPoint = point;
			}
		}

		return applyTransform(furthestPoint, transform);
	};

	// Center point function for GJK algorithm
	const getCenterPoint = (transform: TransformType): THREE.Vector3 => {
		return transform.position ? transform.position.clone() : new THREE.Vector3();
	};

	// Create the collider instance
	return Collider({
		...COLLIDER_DEFAULTS,
		type: ColliderType.DODECAHEDRON,
		radius,
		size,
		vertices,
		faceNormals,
		getSupportPoint,
		getCenterPoint,
		cachedGeometry: {
			vertices: vertices.map((v) => v.clone()),
			normals: faceNormals.map((n) => n.clone()),
			transformedVertices: [],
			lastTransform: undefined,
		},
		...rest,
	});
}

// Add temporary quaternion for conversions
const tempQuaternion = new THREE.Quaternion();
const tempQuaternionInverse = new THREE.Quaternion();

// Helper function to apply transform to a point
function applyTransform(point: THREE.Vector3, transform: TransformType): THREE.Vector3 {
	const transformed = point
		.clone()
		.multiplyScalar(transform.scale.x) // Assuming uniform scale for simplicity
		.applyQuaternion(tempQuaternion.setFromEuler(transform.rotation))
		.add(transform.position);
	return transformed;
}

// Helper function to create dodecahedron vertices
function createDodecahedronVertices(radius: number): THREE.Vector3[] {
	const phi = (1 + Math.sqrt(5)) / 2;
	const vertices: THREE.Vector3[] = [];

	// The 20 vertices of a regular dodecahedron
	const a = radius / Math.sqrt(3);
	const b = (radius * phi) / Math.sqrt(3);
	const c = radius / (phi * Math.sqrt(3));

	// Add vertices for (±a, ±a, ±a)
	[
		[a, a, a],
		[a, a, -a],
		[a, -a, a],
		[a, -a, -a],
		[-a, a, a],
		[-a, a, -a],
		[-a, -a, a],
		[-a, -a, -a],
	].forEach(([x, y, z]) => vertices.push(new THREE.Vector3(x, y, z)));

	// Add vertices for (0, ±b, ±c)
	[
		[0, b, c],
		[0, b, -c],
		[0, -b, c],
		[0, -b, -c],
	].forEach(([x, y, z]) => vertices.push(new THREE.Vector3(x, y, z)));

	// Add vertices for (±b, ±c, 0)
	[
		[b, c, 0],
		[b, -c, 0],
		[-b, c, 0],
		[-b, -c, 0],
	].forEach(([x, y, z]) => vertices.push(new THREE.Vector3(x, y, z)));

	// Add vertices for (±c, 0, ±b)
	[
		[c, 0, b],
		[c, 0, -b],
		[-c, 0, b],
		[-c, 0, -b],
	].forEach(([x, y, z]) => vertices.push(new THREE.Vector3(x, y, z)));

	return vertices;
}

// Helper function to calculate face normals
function calculateDodecahedronFaceNormals(vertices: THREE.Vector3[]): THREE.Vector3[] {
	const normals: THREE.Vector3[] = [];

	// Define all 12 faces of the dodecahedron
	// Each face is a pentagon, we'll use three vertices to define the plane
	const faces = [
		// Top pentagon
		[0, 1, 4],
		// Upper middle pentagons
		[1, 2, 5],
		[2, 3, 6],
		[3, 4, 7],
		[4, 0, 8],
		// Lower middle pentagons
		[5, 6, 9],
		[6, 7, 10],
		[7, 8, 11],
		[8, 9, 12],
		[9, 5, 13],
		// Bottom pentagon
		[14, 15, 16],
		[17, 18, 19],
	];

	// Calculate normal for each face
	faces.forEach(([a, b, c]) => {
		const v1 = vertices[b].clone().sub(vertices[a]);
		const v2 = vertices[c].clone().sub(vertices[a]);
		const normal = v1.cross(v2).normalize();
		normals.push(normal);
	});

	// Cache the face normals for collision detection
	return normals;
}

// Helper function to check if a point is inside the dodecahedron
function isPointInsideDodecahedron(
	point: THREE.Vector3,
	vertices: THREE.Vector3[],
	normals: THREE.Vector3[],
	transform: TransformType
): boolean {
	// Transform the point into local space using quaternion
	tempQuaternion.setFromEuler(transform.rotation);
	tempQuaternionInverse.copy(tempQuaternion).invert();

	const localPoint = point.clone().sub(transform.position).applyQuaternion(tempQuaternionInverse);
	localPoint.divide(transform.scale); // Assuming uniform scale

	// A point is inside if it's on the negative side of all face planes
	for (let i = 0; i < normals.length; i++) {
		const normal = normals[i];
		const vertex = vertices[i * 3]; // Use first vertex of each face as reference point

		const signedDistance = normal.dot(localPoint.clone().sub(vertex));
		if (signedDistance > 1e-6) {
			// Small epsilon for floating point precision
			return false;
		}
	}

	return true;
}
