import { Entity, World } from 'koota';
import * as THREE from 'three';
import { BoxCollider, CollisionLayer, HeightfieldCollider, Ref, Transform } from '../../traits';
import { PHYSICS_BODY_DEFAULTS, PhysicsBody } from '../../traits/physics-body';

const GRASS_LIGHT = '#8BC34A'; // Lighter grass color
const GRASS_DARK = '#4a8505'; // Darker grass color
const DIRT = '#8B4513'; // Dirt color
const SAND = '#F4A460'; // Sand color

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

	// Generate height data and store it for collision detection
	const vertices = geometry.attributes.position.array;
	const heightData = new Float32Array((TERRAIN_SEGMENTS + 1) * (TERRAIN_SEGMENTS + 1));
	let minHeight = Infinity;
	let maxHeight = -Infinity;

	// Fill height data and track min/max heights
	for (let i = 0; i < vertices.length; i += 3) {
		const x = vertices[i];
		const z = vertices[i + 2];
		const height = generateHeight(x * NOISE_SCALE, z * NOISE_SCALE);
		vertices[i + 1] = height; // Y coordinate

		// Store in heightData grid
		const gridX = Math.floor((x / TERRAIN_SIZE + 0.5) * TERRAIN_SEGMENTS);
		const gridZ = Math.floor((z / TERRAIN_SIZE + 0.5) * TERRAIN_SEGMENTS);
		const index = gridZ * (TERRAIN_SEGMENTS + 1) + gridX;
		heightData[index] = height;

		// Track min/max heights
		minHeight = Math.min(minHeight, height);
		maxHeight = Math.max(maxHeight, height);
	}

	// Update normals for proper lighting
	geometry.computeVertexNormals();

	// Create terrain material with grass-like appearance
	const material = new THREE.MeshStandardMaterial({
		color: GRASS_DARK,
		roughness: 0.8,
		metalness: 0.1,
		flatShading: false,
	});

	const mesh = new THREE.Mesh(geometry, material);

	// Create the terrain entity with heightfield collider
	const entity = world.spawn(
		Transform({
			position: new THREE.Vector3(0, 0, 0),
			rotation: new THREE.Euler(),
			scale: new THREE.Vector3(1, 1, 1),
		}),
		HeightfieldCollider({
			heightData: heightData,
			resolution: TERRAIN_SEGMENTS + 1,
			minHeight: minHeight,
			maxHeight: maxHeight,
			size: new THREE.Vector3(TERRAIN_SIZE, maxHeight - minHeight, TERRAIN_SIZE),
			layer: CollisionLayer.TERRAIN,
			mask: CollisionLayer.ALL,
		}),
		PhysicsBody({
			...PHYSICS_BODY_DEFAULTS,
			isStatic: true,
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
		BoxCollider({
			size: size.clone(),
			layer: CollisionLayer.TERRAIN,
			mask: CollisionLayer.ALL,
		}),
		PhysicsBody({
			...PHYSICS_BODY_DEFAULTS,
			isStatic: true,
		})
	);

	// Create mesh
	const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
	const material = new THREE.MeshStandardMaterial({
		color: DIRT, // Saddle brown color
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
