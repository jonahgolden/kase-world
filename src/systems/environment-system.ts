import { World } from 'koota';
import * as THREE from 'three';
import { createBush, createRock, createTree } from '../factories/environment/nature-factory';
import { createTerrain } from '../factories/environment/terrain-factory';
import { Collider, ColliderInstanceType, ColliderType } from '../traits/collider';

// Constants for biome-based placement
const MAX_HEIGHT = 14;
const SNOW_HEIGHT = MAX_HEIGHT * 0.65; // ~9.1 units
const ROCK_HEIGHT = MAX_HEIGHT * 0.55; // ~7.7 units

// Flag to ensure we only create the environment once
let environmentCreated = false;

/**
 * Creates and sets up the game environment
 */
export function setupEnvironment(world: World) {
	if (environmentCreated) return;

	// Create main terrain
	const terrain = createTerrain(world);
	const maybeCollider = terrain.get(Collider);
	if (!maybeCollider || maybeCollider.type !== ColliderType.HEIGHTFIELD || !maybeCollider.heightData) {
		console.error('Terrain created without valid heightfield collider!');
		return;
	}

	// Create a properly typed reference
	const terrainCollider: Required<Pick<ColliderInstanceType, 'size' | 'resolution' | 'heightData'>> = {
		size: maybeCollider.size,
		resolution: maybeCollider.resolution,
		heightData: maybeCollider.heightData,
	};

	// Helper function to get terrain height at a point
	function getTerrainHeightAt(x: number, z: number): number {
		const size = terrainCollider.size;
		const resolution = terrainCollider.resolution;
		const heightData = terrainCollider.heightData;

		// Convert world coordinates to heightfield grid coordinates
		const halfSize = size.x / 2;
		const gridX = Math.floor(((x + halfSize) / size.x) * (resolution - 1));
		const gridZ = Math.floor(((z + halfSize) / size.z) * (resolution - 1));

		// Ensure we're within bounds
		if (gridX < 0 || gridX >= resolution || gridZ < 0 || gridZ >= resolution) {
			return 0;
		}

		return heightData[gridZ * resolution + gridX];
	}

	// Helper function to check if a position is suitable for object placement
	function isSuitablePosition(
		x: number,
		z: number,
		minFlatness: number = 0.3,
		maxHeight: number | null = null
	): boolean {
		const centerHeight = getTerrainHeightAt(x, z);

		// Check height constraints
		if (maxHeight !== null && centerHeight > maxHeight) {
			return false;
		}

		// Check surrounding points for slope
		const checkRadius = 2;
		const points = [
			{ dx: -checkRadius, dz: 0 },
			{ dx: checkRadius, dz: 0 },
			{ dx: 0, dz: -checkRadius },
			{ dx: 0, dz: checkRadius },
		];

		for (const point of points) {
			const heightDiff = Math.abs(centerHeight - getTerrainHeightAt(x + point.dx, z + point.dz));
			if (heightDiff > minFlatness) {
				return false;
			}
		}

		return true;
	}

	// Create forest areas with proper height placement and varying sizes
	function createForestArea(center: THREE.Vector3, count: number, largeTreesRatio: number = 0) {
		const SPAWN_RADIUS = 20; // Increased from 15
		const MIN_DISTANCE_SMALL = 3;
		const MIN_DISTANCE_LARGE = 6;
		const trees: { position: THREE.Vector3; isLarge: boolean }[] = [];

		for (let i = 0; i < count; i++) {
			let validPosition = false;
			let position: THREE.Vector3 | null = null;
			let attempts = 0;
			const MAX_ATTEMPTS = 10;
			const isLargeTree = Math.random() < largeTreesRatio;
			const minDistance = isLargeTree ? MIN_DISTANCE_LARGE : MIN_DISTANCE_SMALL;

			while (!validPosition && attempts < MAX_ATTEMPTS) {
				const angle = Math.random() * Math.PI * 2;
				const radius = Math.random() * SPAWN_RADIUS;
				const x = center.x + Math.cos(angle) * radius;
				const z = center.z + Math.sin(angle) * radius;

				// Check terrain suitability - no trees in snow
				if (!isSuitablePosition(x, z, 0.5, SNOW_HEIGHT)) {
					attempts++;
					continue;
				}

				// Get proper height from terrain
				const y = getTerrainHeightAt(x, z);
				position = new THREE.Vector3(x, y, z);

				// Check distance from other trees
				validPosition = true;
				for (const tree of trees) {
					const requiredDistance = tree.isLarge ? MIN_DISTANCE_LARGE : minDistance;
					if (position.distanceTo(tree.position) < requiredDistance) {
						validPosition = false;
						break;
					}
				}

				attempts++;
			}

			if (validPosition && position) {
				const scale = isLargeTree ? 1.8 + Math.random() * 0.8 : 0.8 + Math.random() * 0.4;
				createTree(world, position, scale);
				trees.push({ position, isLarge: isLargeTree });
			}
		}
	}

	// Create an old-growth forest with massive trees and dense undergrowth
	function createOldGrowthForest(center: THREE.Vector3) {
		const FOREST_RADIUS = 35; // Larger area for the old growth forest
		const MASSIVE_TREE_COUNT = 25;
		const LARGE_TREE_COUNT = 35;
		const NORMAL_TREE_COUNT = 45;
		const BUSH_COUNT = 120;

		const MIN_DISTANCE_MASSIVE = 10;
		const MIN_DISTANCE_LARGE = 6;
		const MIN_DISTANCE_NORMAL = 3;
		const MIN_DISTANCE_BUSH = 2;

		const allObjects: { position: THREE.Vector3; radius: number }[] = [];

		// Helper to check if a position is too close to existing objects
		function isTooClose(pos: THREE.Vector3, minDistance: number): boolean {
			for (const obj of allObjects) {
				const requiredDistance = obj.radius + minDistance;
				if (pos.distanceTo(obj.position) < requiredDistance) {
					return true;
				}
			}
			return false;
		}

		// Place massive ancient trees first
		for (let i = 0; i < MASSIVE_TREE_COUNT; i++) {
			let validPosition = false;
			let position: THREE.Vector3 | null = null;
			let attempts = 0;
			const MAX_ATTEMPTS = 15;

			while (!validPosition && attempts < MAX_ATTEMPTS) {
				const angle = Math.random() * Math.PI * 2;
				const radius = 5 + Math.random() * (FOREST_RADIUS - 5); // Keep away from center
				const x = center.x + Math.cos(angle) * radius;
				const z = center.z + Math.sin(angle) * radius;

				if (!isSuitablePosition(x, z, 0.7, SNOW_HEIGHT)) {
					attempts++;
					continue;
				}

				const y = getTerrainHeightAt(x, z);
				position = new THREE.Vector3(x, y, z);

				if (!isTooClose(position, MIN_DISTANCE_MASSIVE)) {
					validPosition = true;
				}

				attempts++;
			}

			if (validPosition && position) {
				const scale = 3.0 + Math.random() * 1.0; // Massive trees
				createTree(world, position, scale);
				allObjects.push({ position, radius: MIN_DISTANCE_MASSIVE });
			}
		}

		// Add large trees
		for (let i = 0; i < LARGE_TREE_COUNT; i++) {
			let validPosition = false;
			let position: THREE.Vector3 | null = null;
			let attempts = 0;
			const MAX_ATTEMPTS = 10;

			while (!validPosition && attempts < MAX_ATTEMPTS) {
				const angle = Math.random() * Math.PI * 2;
				const radius = Math.random() * FOREST_RADIUS;
				const x = center.x + Math.cos(angle) * radius;
				const z = center.z + Math.sin(angle) * radius;

				if (!isSuitablePosition(x, z, 0.5, SNOW_HEIGHT)) {
					attempts++;
					continue;
				}

				const y = getTerrainHeightAt(x, z);
				position = new THREE.Vector3(x, y, z);

				if (!isTooClose(position, MIN_DISTANCE_LARGE)) {
					validPosition = true;
				}

				attempts++;
			}

			if (validPosition && position) {
				const scale = 1.8 + Math.random() * 0.8;
				createTree(world, position, scale);
				allObjects.push({ position, radius: MIN_DISTANCE_LARGE });
			}
		}

		// Add normal trees
		for (let i = 0; i < NORMAL_TREE_COUNT; i++) {
			let validPosition = false;
			let position: THREE.Vector3 | null = null;
			let attempts = 0;
			const MAX_ATTEMPTS = 10;

			while (!validPosition && attempts < MAX_ATTEMPTS) {
				const angle = Math.random() * Math.PI * 2;
				const radius = Math.random() * FOREST_RADIUS;
				const x = center.x + Math.cos(angle) * radius;
				const z = center.z + Math.sin(angle) * radius;

				if (!isSuitablePosition(x, z, 0.4, SNOW_HEIGHT)) {
					attempts++;
					continue;
				}

				const y = getTerrainHeightAt(x, z);
				position = new THREE.Vector3(x, y, z);

				if (!isTooClose(position, MIN_DISTANCE_NORMAL)) {
					validPosition = true;
				}

				attempts++;
			}

			if (validPosition && position) {
				const scale = 0.8 + Math.random() * 0.4;
				createTree(world, position, scale);
				allObjects.push({ position, radius: MIN_DISTANCE_NORMAL });
			}
		}

		// Add dense undergrowth with varying bush sizes
		for (let i = 0; i < BUSH_COUNT; i++) {
			let validPosition = false;
			let position: THREE.Vector3 | null = null;
			let attempts = 0;
			const MAX_ATTEMPTS = 10;

			while (!validPosition && attempts < MAX_ATTEMPTS) {
				const angle = Math.random() * Math.PI * 2;
				const radius = Math.random() * (FOREST_RADIUS + 5); // Slightly larger radius for bushes
				const x = center.x + Math.cos(angle) * radius;
				const z = center.z + Math.sin(angle) * radius;

				if (!isSuitablePosition(x, z, 0.3, SNOW_HEIGHT)) {
					attempts++;
					continue;
				}

				const y = getTerrainHeightAt(x, z);
				position = new THREE.Vector3(x, y, z);

				if (!isTooClose(position, MIN_DISTANCE_BUSH)) {
					validPosition = true;
				}

				attempts++;
			}

			if (validPosition && position) {
				const scale = 0.6 + Math.random() * 1.2; // Wider range of bush sizes
				createBush(world, position, scale);
				allObjects.push({ position, radius: MIN_DISTANCE_BUSH });
			}
		}
	}

	// Create rock formations with proper height placement and varying sizes
	function createRockFormations(center: THREE.Vector3, count: number, largeRocksRatio: number = 0) {
		const SPAWN_RADIUS = 15; // Increased from 10
		const MIN_DISTANCE_SMALL = 2;
		const MIN_DISTANCE_LARGE = 5;
		const rocks: { position: THREE.Vector3; isLarge: boolean }[] = [];

		for (let i = 0; i < count; i++) {
			let validPosition = false;
			let position: THREE.Vector3 | null = null;
			let attempts = 0;
			const MAX_ATTEMPTS = 10;
			const isLargeRock = Math.random() < largeRocksRatio;
			const minDistance = isLargeRock ? MIN_DISTANCE_LARGE : MIN_DISTANCE_SMALL;

			while (!validPosition && attempts < MAX_ATTEMPTS) {
				const angle = Math.random() * Math.PI * 2;
				const radius = Math.random() * SPAWN_RADIUS;
				const x = center.x + Math.cos(angle) * radius;
				const z = center.z + Math.sin(angle) * radius;

				// Check terrain suitability - rocks can be anywhere including snow
				if (!isSuitablePosition(x, z, isLargeRock ? 1.2 : 0.8)) {
					attempts++;
					continue;
				}

				// Get proper height from terrain
				const y = getTerrainHeightAt(x, z);
				position = new THREE.Vector3(x, y, z);

				// Check distance from other rocks
				validPosition = true;
				for (const rock of rocks) {
					const requiredDistance = rock.isLarge ? MIN_DISTANCE_LARGE : minDistance;
					if (position.distanceTo(rock.position) < requiredDistance) {
						validPosition = false;
						break;
					}
				}

				attempts++;
			}

			if (validPosition && position) {
				const scale = isLargeRock ? 2.0 + Math.random() * 1.5 : 0.8 + Math.random() * 1.2;
				createRock(world, position, scale);
				rocks.push({ position, isLarge: isLargeRock });
			}
		}
	}

	// Create massive rock formations in specific locations
	function createMassiveRocks() {
		const MASSIVE_ROCK_POSITIONS = [
			{ pos: new THREE.Vector3(-40, 0, 50), scale: 5.0 + Math.random() * 1.0 },
			{ pos: new THREE.Vector3(60, 0, 60), scale: 4.5 + Math.random() * 1.0 },
			{ pos: new THREE.Vector3(30, 0, -50), scale: 4.0 + Math.random() * 1.0 },
			{ pos: new THREE.Vector3(-20, 0, -40), scale: 4.8 + Math.random() * 1.0 },
			{ pos: new THREE.Vector3(0, 0, 70), scale: 5.5 + Math.random() * 1.0 },
		];

		for (const { pos, scale } of MASSIVE_ROCK_POSITIONS) {
			// Only place if the terrain is suitable for massive rocks and height is in rock zone
			const y = getTerrainHeightAt(pos.x, pos.z);
			if (isSuitablePosition(pos.x, pos.z, 1.5) && y >= ROCK_HEIGHT && y < SNOW_HEIGHT) {
				pos.y = y;

				// Create a cluster of large rocks to form a massive formation
				createRock(world, pos, scale);

				// Add some smaller rocks around the main one
				const CLUSTER_COUNT = 4;
				for (let i = 0; i < CLUSTER_COUNT; i++) {
					const angle = (i / CLUSTER_COUNT) * Math.PI * 2 + Math.random() * 0.5;
					const radius = scale * 0.8 + Math.random() * (scale * 0.4);
					const clusterPos = new THREE.Vector3(
						pos.x + Math.cos(angle) * radius,
						y,
						pos.z + Math.sin(angle) * radius
					);

					if (isSuitablePosition(clusterPos.x, clusterPos.z, 1.2)) {
						createRock(world, clusterPos, scale * (0.4 + Math.random() * 0.3));
					}
				}
			}
		}
	}

	// Create an old-growth forest with massive trees and dense undergrowth
	createOldGrowthForest(new THREE.Vector3(20, 0, -80));

	// Create large forest area with varying tree sizes
	createForestArea(new THREE.Vector3(-60, 0, -60), 40, 0.3); // 30% large trees

	// Create smaller forest areas
	createForestArea(new THREE.Vector3(40, 0, -30), 15, 0.2);
	createForestArea(new THREE.Vector3(0, 0, 0), 10, 0.1);

	// Create large rock formations in mountainous areas
	createRockFormations(new THREE.Vector3(-30, 0, 30), 15, 0.4); // 40% large rocks
	createRockFormations(new THREE.Vector3(20, 0, 40), 12, 0.3);
	createRockFormations(new THREE.Vector3(10, 0, -10), 8, 0.2);
	createRockFormations(new THREE.Vector3(-10, 0, 10), 8, 0.2);

	// Create massive rock formations
	createMassiveRocks();

	// Add scattered bushes with proper height placement (avoiding snow)
	for (let i = 0; i < 50; i++) {
		const x = (Math.random() - 0.5) * 160;
		const z = (Math.random() - 0.5) * 160;

		// Check terrain suitability - no bushes in snow
		if (isSuitablePosition(x, z, 0.6, SNOW_HEIGHT)) {
			const y = getTerrainHeightAt(x, z);
			createBush(world, new THREE.Vector3(x, y, z), 0.8 + Math.random() * 0.4);
		}
	}

	environmentCreated = true;
}
