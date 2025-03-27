import { Entity, World } from 'koota';
import * as THREE from 'three';
import { Collider, ColliderType, CollisionLayer, PhysicsBody, Ref, Transform } from '../../traits';

const TERRAIN_COLOR = '#8BC34A';

// Constants for terrain generation
const TERRAIN_SEGMENTS = 128; // Number of segments in the terrain grid
const TERRAIN_SIZE = 200; // Size of the terrain in world units
const MAX_HEIGHT = 5; // Maximum height of terrain features
const NOISE_SCALE = 0.02; // Scale of the noise (higher = more compressed features)

/**
 * Creates a terrain entity with varying elevation using simplex noise
 */
export function createTerrain(world: World): Entity {
	// Create a heightmap using simplex noise
	const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
	geometry.rotateX(-Math.PI / 2); // Rotate to be horizontal

	// Generate height data
	const vertices = geometry.attributes.position.array;
	for (let i = 0; i < vertices.length; i += 3) {
		const x = vertices[i];
		const z = vertices[i + 2];

		// Generate height using multiple noise octaves for more natural terrain
		const height = generateHeight(x * NOISE_SCALE, z * NOISE_SCALE);
		vertices[i + 1] = height; // Y coordinate
	}

	// Update normals for proper lighting
	geometry.computeVertexNormals();

	// Create terrain material with grass-like appearance
	const material = new THREE.MeshStandardMaterial({
		color: '#4a8505', // Base grass color
		roughness: 0.8,
		metalness: 0.1,
		flatShading: false,
	});

	const mesh = new THREE.Mesh(geometry, material);

	// Create the terrain entity
	const entity = world.spawn(
		Transform({
			position: new THREE.Vector3(0, 0, 0),
			rotation: new THREE.Euler(),
			scale: new THREE.Vector3(1, 1, 1),
		}),
		Collider({
			type: ColliderType.BOX, // Using box collider for simplicity
			size: new THREE.Vector3(TERRAIN_SIZE, 0.1, TERRAIN_SIZE),
			layer: CollisionLayer.TERRAIN,
			mask: CollisionLayer.ALL,
			isTrigger: false,
			radius: 0,
			height: 0,
			offset: new THREE.Vector3(0, 0, 0),
			friction: 0.3,
			restitution: 0.1,
		}),
		PhysicsBody({
			mass: 0,
			drag: 0,
			gravity: false,
			gravityScale: 0,
			isKinematic: false,
			isStatic: true,
			constraints: { x: true, y: true, z: true },
			terminalVelocity: 0,
			groundFriction: 0.8,
			restitution: 0.3,
			forces: new THREE.Vector3(),
			isGrounded: true,
			groundNormal: new THREE.Vector3(0, 1, 0),
			lastGroundedTime: 0,
		})
	);

	entity.add(Ref(mesh));
	return entity;
}

/**
 * Creates a flat platform (useful for specific gameplay areas)
 */
export function createPlatform(world: World, position: THREE.Vector3, size: THREE.Vector3): Entity {
	const entity = world.spawn(
		Transform({
			position: position.clone(),
			rotation: new THREE.Euler(),
			scale: new THREE.Vector3(1, 1, 1),
		}),
		Collider({
			type: ColliderType.BOX,
			size: size.clone(),
			layer: CollisionLayer.TERRAIN,
			mask: CollisionLayer.ALL,
			isTrigger: false,
			radius: 0,
			height: size.y,
			offset: new THREE.Vector3(0, 0, 0),
			friction: 0.3,
			restitution: 0.1,
		}),
		PhysicsBody({
			mass: 0,
			drag: 0,
			gravity: false,
			gravityScale: 0,
			isKinematic: false,
			isStatic: true,
			constraints: { x: true, y: true, z: true },
			terminalVelocity: 0,
			groundFriction: 0.8,
			restitution: 0.3,
			forces: new THREE.Vector3(),
			isGrounded: true,
			groundNormal: new THREE.Vector3(0, 1, 0),
			lastGroundedTime: 0,
		})
	);

	// Create mesh
	const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
	const material = new THREE.MeshStandardMaterial({
		color: '#8B4513', // Saddle brown color
		roughness: 0.9,
		metalness: 0.1,
	});
	const mesh = new THREE.Mesh(geometry, material);
	entity.add(Ref(mesh));

	return entity;
}

// Helper function to generate height using multiple noise octaves
function generateHeight(x: number, z: number): number {
	// Simplex noise implementation would go here
	// For now, using a simple wave pattern
	const height = Math.sin(x * 5) * Math.cos(z * 5) * MAX_HEIGHT * 0.3;
	return height;
}
