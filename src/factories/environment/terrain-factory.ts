import { Entity, World } from 'koota';
import { createNoise2D } from 'simplex-noise';
import * as THREE from 'three';
import { BoxCollider, CollisionLayer, HeightfieldCollider, Ref, Transform } from '../../traits';
import { PHYSICS_BODY_DEFAULTS, PhysicsBody } from '../../traits/physics-body';

// Terrain colors and materials
const TERRAIN_COLORS = {
	GRASS_LIGHT: '#8BC34A',
	GRASS_DARK: '#4a8505',
	DIRT: '#8B4513',
	SAND: '#F4A460',
	ROCK: '#808080',
	Snow: '#FFFFFF',
};

// Constants for terrain generation
const TERRAIN_SEGMENTS = 128;
const TERRAIN_SIZE = 200;
const MAX_HEIGHT = 14;
const BASE_NOISE_SCALE = 0.01;

// Biome thresholds
const SNOW_HEIGHT = MAX_HEIGHT * 0.65;
const ROCK_HEIGHT = MAX_HEIGHT * 0.55;
const GRASS_HEIGHT = MAX_HEIGHT * 0.1;
const SAND_HEIGHT = MAX_HEIGHT * 0.06;

// Slope thresholds (in radians)
const STEEP_SLOPE = Math.PI / 2.5; // ~72 degrees - much steeper threshold for rocks
const MODERATE_SLOPE = Math.PI / 8;

/**
 * Creates a terrain entity with varying elevation and biomes using multiple noise layers
 */
export function createTerrain(world: World): Entity {
	// Create noise generators for different features
	const baseNoise = createNoise2D();
	const detailNoise = createNoise2D();
	const biomeNoise = createNoise2D();

	// Create geometry
	const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
	geometry.rotateX(-Math.PI / 2);

	// Generate height data and store it for collision detection
	const vertices = geometry.attributes.position.array;
	const heightData = new Float32Array((TERRAIN_SEGMENTS + 1) * (TERRAIN_SEGMENTS + 1));
	const colors = new Float32Array(vertices.length);
	let minHeight = Infinity;
	let maxHeight = -Infinity;

	// Helper function to get biome color based on height and slope
	function getBiomeColor(height: number, slope: number): THREE.Color {
		const color = new THREE.Color();

		if (height > SNOW_HEIGHT) {
			color.setStyle(TERRAIN_COLORS.Snow);
		} else if ((height > ROCK_HEIGHT && slope > MODERATE_SLOPE) || slope > STEEP_SLOPE) {
			// Rock only appears on steep high areas or very steep slopes
			color.setStyle(TERRAIN_COLORS.ROCK);
		} else if (height > GRASS_HEIGHT || slope > MODERATE_SLOPE) {
			const darkGrassInfluence =
				Math.min(
					1.0,
					Math.max((height - GRASS_HEIGHT) / (ROCK_HEIGHT - GRASS_HEIGHT), slope / MODERATE_SLOPE)
				) * 0.9;
			color.setStyle(TERRAIN_COLORS.GRASS_LIGHT);
			color.lerp(new THREE.Color(TERRAIN_COLORS.GRASS_DARK), darkGrassInfluence);
		} else if (height > SAND_HEIGHT) {
			color.setStyle(TERRAIN_COLORS.GRASS_LIGHT);
		} else {
			color.setStyle(TERRAIN_COLORS.SAND);
		}

		return color;
	}

	// Generate terrain height and colors
	for (let i = 0; i < vertices.length; i += 3) {
		const x = vertices[i];
		const z = vertices[i + 2];

		// Generate height using multiple noise layers
		const baseHeight = generateHeight(x, z, baseNoise);
		const detailHeight = generateDetailHeight(x, z, detailNoise);
		const biomeVariation = generateBiomeVariation(x, z, biomeNoise);

		// Adjusted height calculation with increased detail influence in peaks
		const heightRatio = Math.pow(baseHeight, 2); // Square for sharper transition
		const detailInfluence = 0.15 + heightRatio * 0.15; // More detail in higher areas
		const height = (baseHeight + detailHeight * detailInfluence + biomeVariation * 0.02) * MAX_HEIGHT;
		vertices[i + 1] = height;

		// Calculate slope for terrain type determination
		const slope = calculateSlope(x, z, vertices, i, TERRAIN_SEGMENTS);

		// Store in heightData grid
		const gridX = Math.floor((x / TERRAIN_SIZE + 0.5) * TERRAIN_SEGMENTS);
		const gridZ = Math.floor((z / TERRAIN_SIZE + 0.5) * TERRAIN_SEGMENTS);
		const index = gridZ * (TERRAIN_SEGMENTS + 1) + gridX;
		heightData[index] = height;

		// Set vertex colors based on height and slope
		const color = getBiomeColor(height, slope);
		colors[i] = color.r;
		colors[i + 1] = color.g;
		colors[i + 2] = color.b;

		// Track min/max heights
		minHeight = Math.min(minHeight, height);
		maxHeight = Math.max(maxHeight, height);
	}

	// Add colors to geometry
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

	// Update normals for proper lighting
	geometry.computeVertexNormals();

	// Create terrain material with vertex colors
	const material = new THREE.MeshStandardMaterial({
		vertexColors: true,
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

// Helper function to generate base terrain height
function generateHeight(x: number, z: number, noise: (x: number, y: number) => number): number {
	const scale = BASE_NOISE_SCALE;
	const rawNoise = (noise(x * scale, z * scale) + 1) * 0.5;

	// Create more dramatic mountains with sharper peaks but less steep overall
	const baseShape = Math.pow(rawNoise, 3.0); // Increased from 2.8 but not back to 3.2

	// Peak generation with more variation
	const peakShape = Math.pow(rawNoise, 10); // Increased from 8 but not back to 12

	// Enhanced cragginess system
	const cragginess = (noise(x * scale * 4, z * scale * 4) + 1) * 0.5;
	const highFreqCrags = (noise(x * scale * 8, z * scale * 8) + 1) * 0.5;
	const ultraCrags = (noise(x * scale * 16, z * scale * 16) + 1) * 0.5;
	const combinedCrags = (cragginess * 0.5 + highFreqCrags * 0.3 + ultraCrags * 0.2) * peakShape;

	// Multi-directional ridge system
	const angles = [Math.atan2(z, x), Math.atan2(x, z), Math.atan2(z + x, x - z)];

	let ridgeSum = 0;
	for (let i = 0; i < angles.length; i++) {
		const angle = angles[i];
		const ridgeNoise = Math.abs(
			noise(x * scale * (2 + i * 0.5) + Math.cos(angle), z * scale * (2 + i * 0.5) + Math.sin(angle))
		);
		const ridgeDirection = (Math.sin(angle * (2 + i)) + 1) * 0.5;
		ridgeSum += Math.pow(ridgeNoise * ridgeDirection, 1.2) * (0.6 - i * 0.15);
	}

	// Add erosion-like patterns
	const erosion = (noise(x * scale * 5 + combinedCrags, z * scale * 5 + ridgeSum) + 1) * 0.5;
	const erosionDetail = Math.pow(erosion, 1.5) * peakShape;

	// Combine all factors for final height with more varied peak features
	const peakMultiplier =
		peakShape *
		(1.6 + // Increased from 1.5
			combinedCrags * 1.2 +
			ridgeSum * 0.8 +
			erosionDetail * 0.4 +
			Math.pow(noise(x * scale * 12, z * scale * 12) + 1, 2) * 0.3 * peakShape);

	return baseShape * (1 + peakMultiplier);
}

// Helper function to generate detail noise
function generateDetailHeight(x: number, z: number, noise: (x: number, y: number) => number): number {
	const detailScale = BASE_NOISE_SCALE * 6;
	const rawNoise = (noise(x * detailScale, z * detailScale) + 1) * 0.5;

	// Multi-scale detail with even more variation
	const fineDetail = (noise(x * detailScale * 2, z * detailScale * 2) + 1) * 0.5;
	const microDetail = (noise(x * detailScale * 4, z * detailScale * 4) + 1) * 0.5;
	const ultraDetail = (noise(x * detailScale * 8, z * detailScale * 8) + 1) * 0.5;
	const megaDetail = (noise(x * detailScale * 16, z * detailScale * 16) + 1) * 0.5;

	// Combine different detail scales with emphasis on varied detail
	return (
		(rawNoise * 0.35 + fineDetail * 0.3 + microDetail * 0.2 + ultraDetail * 0.1 + megaDetail * 0.05) * 0.6
	); // Increased overall detail influence
}

// Helper function to generate biome variation
function generateBiomeVariation(x: number, z: number, noise: (x: number, y: number) => number): number {
	const biomeScale = BASE_NOISE_SCALE * 0.25; // Slightly reduced for smoother transitions
	return (noise(x * biomeScale, z * biomeScale) + 1) * 0.5;
}

// Helper function to calculate slope at a point
function calculateSlope(
	x: number,
	z: number,
	vertices: ArrayLike<number>,
	index: number,
	segments: number
): number {
	const i = Math.floor(index / 3);
	const row = Math.floor(i / (segments + 1));
	const col = i % (segments + 1);

	let maxSlope = 0;

	// Check neighboring vertices
	const directions = [
		{ dx: 1, dz: 0 },
		{ dx: -1, dz: 0 },
		{ dx: 0, dz: 1 },
		{ dx: 0, dz: -1 },
	];

	for (const dir of directions) {
		const neighborRow = row + dir.dz;
		const neighborCol = col + dir.dx;

		if (neighborRow >= 0 && neighborRow <= segments && neighborCol >= 0 && neighborCol <= segments) {
			const neighborIndex = (neighborRow * (segments + 1) + neighborCol) * 3;
			const heightDiff = Math.abs(vertices[index + 1] - vertices[neighborIndex + 1]);
			const distance = Math.sqrt(dir.dx * dir.dx + dir.dz * dir.dz);
			const slope = Math.atan2(heightDiff, distance);
			maxSlope = Math.max(maxSlope, slope);
		}
	}

	return maxSlope;
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
		color: TERRAIN_COLORS.DIRT, // Saddle brown color
		roughness: 0.9,
		metalness: 0.1,
	});
	const mesh = new THREE.Mesh(geometry, material);
	entity.add(Ref(mesh));

	return entity;
}
