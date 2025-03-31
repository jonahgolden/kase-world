import { World } from 'koota';
import * as THREE from 'three';
import { createBush, createRock, createTree } from '../factories/environment/nature-factory';
import { createTerrain, ROCK_HEIGHT, SNOW_HEIGHT } from '../factories/environment/terrain-factory';
import { LAKES_DATA } from '../factories/lakes/const';
import { pointIsInLake } from '../factories/lakes/helpers';
import { createLakes } from '../factories/lakes/lake-factory';
import { Collider, ColliderInstanceType, ColliderType } from '../traits/collider';

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

			if (validPosition && position && !pointIsInLake(position)) {
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

	// Create lakes
	createLakes(world, getTerrainHeightAt);

	// Add Lake shore decorations
	const SHORE_DECORATION_COUNT = {
		LARGE_ROCKS: 4,
		SMALL_ROCKS: 12,
		BUSHES: 12,
	};

	LAKES_DATA.forEach(({ center, radius, waterLevel }) => {
		// Helper to get random position around or in lake
		function getRandomLakePosition(minDist: number, maxDist: number): THREE.Vector3 {
			const angle = Math.random() * Math.PI * 2;
			const dist = minDist + Math.random() * (maxDist - minDist);
			const x = center.x + Math.cos(angle) * dist;
			const z = center.z + Math.sin(angle) * dist;
			const y = getTerrainHeightAt(x, z);
			return new THREE.Vector3(x, y, z);
		}

		// Add large rocks (some in water, some on shore)
		for (let i = 0; i < SHORE_DECORATION_COUNT.LARGE_ROCKS; i++) {
			// Bias placement towards the shore rather than inside lake
			const pos = getRandomLakePosition(radius * 0.7, radius * 1.2);
			const scale = 1.5 + Math.random() * 1.0;

			// Adjust y position if rock is in water
			const distToCenter = Math.sqrt(Math.pow(pos.x - center.x, 2) + Math.pow(pos.z - center.z, 2));
			if (distToCenter < radius) {
				// If in water, make sure rock sticks out
				pos.y = Math.max(pos.y, waterLevel - scale * 0.3);
				// Only 30% chance to place rocks if they're in the water
				if (Math.random() > 0.3) continue;
			}

			// Only place if the slope isn't too steep
			if (isSuitablePosition(pos.x, pos.z, 1.0)) {
				createRock(world, pos, scale);

				// Add cluster of smaller rocks around large ones, but only if not in water
				if (distToCenter >= radius) {
					const CLUSTER_SIZE = 2;
					for (let j = 0; j < CLUSTER_SIZE; j++) {
						const clusterAngle = (j / CLUSTER_SIZE) * Math.PI * 2 + Math.random() * 0.5;
						const clusterDist = scale * (0.8 + Math.random() * 0.4);
						const clusterX = pos.x + Math.cos(clusterAngle) * clusterDist;
						const clusterZ = pos.z + Math.sin(clusterAngle) * clusterDist;
						const clusterY = getTerrainHeightAt(clusterX, clusterZ);
						const clusterPos = new THREE.Vector3(clusterX, clusterY, clusterZ);

						if (isSuitablePosition(clusterX, clusterZ, 0.5)) {
							createRock(world, clusterPos, scale * 0.3);
						}
					}
				}
			}
		}

		// Add small rocks around shore
		for (let i = 0; i < SHORE_DECORATION_COUNT.SMALL_ROCKS; i++) {
			// Place small rocks primarily around the shoreline, biased towards land
			const pos = getRandomLakePosition(radius * 0.9, radius * 1.3);
			const scale = 0.4 + Math.random() * 0.4;

			// Skip 80% of rocks that would be in water
			const distToCenter = Math.sqrt(Math.pow(pos.x - center.x, 2) + Math.pow(pos.z - center.z, 2));
			if (distToCenter < radius && Math.random() > 0.2) continue;

			if (isSuitablePosition(pos.x, pos.z, 0.3)) {
				createRock(world, pos, scale);
			}
		}

		// Add bushes around shore (not in water)
		for (let i = 0; i < SHORE_DECORATION_COUNT.BUSHES; i++) {
			// Place bushes only on shore, not in water
			const pos = getRandomLakePosition(radius * 1.1, radius * 1.8);
			const scale = 0.6 + Math.random() * 0.8;

			// Only place bushes if terrain is suitable and not too steep
			if (isSuitablePosition(pos.x, pos.z, 0.4)) {
				createBush(world, pos, scale);

				// Sometimes add a smaller companion bush
				if (Math.random() < 0.4) {
					const companionAngle = Math.random() * Math.PI * 2;
					const companionDist = scale * (1.2 + Math.random() * 0.8);
					const companionX = pos.x + Math.cos(companionAngle) * companionDist;
					const companionZ = pos.z + Math.sin(companionAngle) * companionDist;
					const companionY = getTerrainHeightAt(companionX, companionZ);
					const companionPos = new THREE.Vector3(companionX, companionY, companionZ);

					if (isSuitablePosition(companionX, companionZ, 0.3)) {
						createBush(world, companionPos, scale * 0.7);
					}
				}
			}
		}
	});

	// Create large forest area with varying tree sizes - avoid lake area
	createForestArea(new THREE.Vector3(-60, 0, -60), 40, 0.3); // 30% large trees

	// Create smaller forest areas - check lake distance
	const forestPositions = [
		{ pos: new THREE.Vector3(40, 0, -30), count: 15, largeRatio: 0.2 },
		{ pos: new THREE.Vector3(0, 0, 0), count: 10, largeRatio: 0.1 },
	];

	for (const forest of forestPositions) {
		createForestArea(forest.pos, forest.count, forest.largeRatio);
	}

	// Create large rock formations in mountainous areas - avoid lake
	const rockFormationPositions = [
		{ pos: new THREE.Vector3(-30, 0, 30), count: 15, largeRatio: 0.4 },
		{ pos: new THREE.Vector3(20, 0, 40), count: 12, largeRatio: 0.3 },
		{ pos: new THREE.Vector3(10, 0, -10), count: 8, largeRatio: 0.2 },
		{ pos: new THREE.Vector3(-10, 0, 10), count: 8, largeRatio: 0.2 },
	];

	for (const formation of rockFormationPositions) {
		createRockFormations(formation.pos, formation.count, formation.largeRatio);
	}

	// Create massive rock formations
	createMassiveRocks();

	// Add scattered bushes with proper height placement (avoiding snow and lake)
	for (let i = 0; i < 50; i++) {
		const x = (Math.random() - 0.5) * 160;
		const z = (Math.random() - 0.5) * 160;
		const pos = new THREE.Vector3(x, 0, z);

		if (isSuitablePosition(x, z, 0.6, SNOW_HEIGHT) && !pointIsInLake(pos)) {
			const y = getTerrainHeightAt(x, z);
			createBush(world, new THREE.Vector3(x, y, z), 0.8 + Math.random() * 0.4);
		}
	}

	environmentCreated = true;
}
