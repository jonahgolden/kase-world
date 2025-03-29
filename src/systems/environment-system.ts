import { World } from 'koota';
import * as THREE from 'three';
import { createBush, createRock, createTree } from '../factories/environment/nature-factory';
import { createTerrain } from '../factories/environment/terrain-factory';
import {
	BoxCollider,
	Collider,
	ColliderInstanceType,
	ColliderType,
	CollisionLayer,
} from '../traits/collider';
import { Ref } from '../traits/ref';
import { Transform } from '../traits/transform';

// Constants for biome-based placement
const MAX_HEIGHT = 14;
const SNOW_HEIGHT = MAX_HEIGHT * 0.65; // ~9.1 units
const ROCK_HEIGHT = MAX_HEIGHT * 0.55; // ~7.7 units
const LAKE_HEIGHT = MAX_HEIGHT * 0.15; // ~2.1 units - water level for lakes

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

	// Create a lake with natural shoreline
	function createLake(world: World) {
		// Lake parameters - match the terrain factory constants
		const center = new THREE.Vector3(-40, 0, 0);
		const radius = 15;
		const segments = 64;
		const waterLevel = MAX_HEIGHT * 0.075;
		const transitionWidth = 10;

		// Create water geometry that follows terrain at edges
		const waterGeometry = new THREE.BufferGeometry();
		const positions = [];
		const uvs = [];
		const indices = [];
		const terrainHeights = [];
		const sandFactors = [];

		// Generate vertices in a circular pattern
		for (let i = 0; i <= segments; i++) {
			for (let j = 0; j <= segments; j++) {
				const u = i / segments;
				const v = j / segments;
				const theta = u * Math.PI * 2;
				const r = v * radius;

				const x = center.x + Math.cos(theta) * r;
				const z = center.z + Math.sin(theta) * r;

				// Get terrain height at this point
				const terrainHeight = getTerrainHeightAt(x, z);
				terrainHeights.push(terrainHeight);

				// Calculate sand factor - sand where terrain is below water level
				const sandFactor = terrainHeight <= waterLevel ? 1.0 : 0.0;
				sandFactors.push(sandFactor);

				// Calculate vertex position
				// Inside lake radius: use water level
				// At edges: blend between water level and terrain height
				const distanceFromCenter = Math.sqrt(Math.pow(x - center.x, 2) + Math.pow(z - center.z, 2));
				let vertexY;
				if (distanceFromCenter <= radius) {
					vertexY = waterLevel;
				} else {
					// Only blend at the very edge if needed
					const edgeT = Math.max(0, Math.min(1, (distanceFromCenter - radius) / transitionWidth));
					vertexY = THREE.MathUtils.lerp(waterLevel, terrainHeight, edgeT);
				}

				positions.push(x, vertexY, z);
				uvs.push(u, v);
			}
		}

		// Generate indices for triangles
		for (let i = 0; i < segments; i++) {
			for (let j = 0; j < segments; j++) {
				const a = i * (segments + 1) + j;
				const b = a + 1;
				const c = a + segments + 1;
				const d = c + 1;
				indices.push(a, b, c);
				indices.push(b, d, c);
			}
		}

		// Create buffer attributes
		waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		waterGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
		waterGeometry.setAttribute('terrainHeight', new THREE.Float32BufferAttribute(terrainHeights, 1));
		waterGeometry.setAttribute('sandFactor', new THREE.Float32BufferAttribute(sandFactors, 1));
		waterGeometry.setIndex(indices);
		waterGeometry.computeVertexNormals();

		// Create water material with advanced effects
		const waterMaterial = new THREE.ShaderMaterial({
			uniforms: {
				time: { value: 0 },
				waterColor: { value: new THREE.Color(0x006994) },
				deepWaterColor: { value: new THREE.Color(0x001e4d) },
				waterLevel: { value: waterLevel },
				waterDepth: { value: 2.0 },
				foamColor: { value: new THREE.Color(0xffffff) },
				sandColor: { value: new THREE.Color(0xc2b280) },
				causticsTex: { value: null },
				flowSpeed: { value: 0.5 },
				waveHeight: { value: 0.15 },
				waveFrequency: { value: 2.0 },
				center: { value: new THREE.Vector2(center.x, center.z) },
				radius: { value: radius },
				edgeWidth: { value: transitionWidth },
			},
			vertexShader: `
				uniform float time;
				uniform float waterLevel;
				uniform float waveHeight;
				uniform float waveFrequency;
				uniform vec2 center;
				uniform float radius;
				uniform float edgeWidth;
				
				attribute float terrainHeight;
				attribute float sandFactor;
				varying vec2 vUv;
				varying float vDepth;
				varying vec3 vPosition;
				varying vec3 vNormal;
				varying float vEdgeFactor;
				varying float vSandFactor;

				// Improved noise function for more natural water movement
				vec4 permute(vec4 x) {
					return mod(((x*34.0)+1.0)*x, 289.0);
				}
				vec4 taylorInvSqrt(vec4 r) {
					return 1.79284291400159 - 0.85373472095314 * r;
				}
				vec3 fade(vec3 t) {
					return t*t*t*(t*(t*6.0-15.0)+10.0);
				}

				float cnoise(vec3 P) {
					vec3 Pi0 = floor(P);
					vec3 Pi1 = Pi0 + vec3(1.0);
					Pi0 = mod(Pi0, 289.0);
					Pi1 = mod(Pi1, 289.0);
					vec3 Pf0 = fract(P);
					vec3 Pf1 = Pf0 - vec3(1.0);
					vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
					vec4 iy = vec4(Pi0.yy, Pi1.yy);
					vec4 iz0 = Pi0.zzzz;
					vec4 iz1 = Pi1.zzzz;

					vec4 ixy = permute(permute(ix) + iy);
					vec4 ixy0 = permute(ixy + iz0);
					vec4 ixy1 = permute(ixy + iz1);

					vec4 gx0 = ixy0/7.0;
					vec4 gy0 = fract(floor(gx0)/7.0)-0.5;
					gx0 = fract(gx0);
					vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
					vec4 sz0 = step(gz0, vec4(0.0));
					gx0 -= sz0 * (step(0.0, gx0) - 0.5);
					gy0 -= sz0 * (step(0.0, gy0) - 0.5);

					vec4 gx1 = ixy1/7.0;
					vec4 gy1 = fract(floor(gx1)/7.0)-0.5;
					gx1 = fract(gx1);
					vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
					vec4 sz1 = step(gz1, vec4(0.0));
					gx1 -= sz1 * (step(0.0, gx1) - 0.5);
					gy1 -= sz1 * (step(0.0, gy1) - 0.5);

					vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
					vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
					vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
					vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
					vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
					vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
					vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
					vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

					vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
					g000 *= norm0.x;
					g010 *= norm0.y;
					g100 *= norm0.z;
					g110 *= norm0.w;
					vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
					g001 *= norm1.x;
					g011 *= norm1.y;
					g101 *= norm1.z;
					g111 *= norm1.w;

					float n000 = dot(g000, Pf0);
					float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
					float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
					float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
					float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
					float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
					float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
					float n111 = dot(g111, Pf1);

					vec3 fade_xyz = fade(Pf0);
					vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
					vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
					float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
					return 2.2 * n_xyz;
				}

				void main() {
					vUv = uv;
					vPosition = position;
					vSandFactor = sandFactor;
					
					// Calculate distance from center for edge effects
					float distanceFromCenter = length(position.xz - center);
					vEdgeFactor = 1.0 - smoothstep(radius - edgeWidth, radius, distanceFromCenter);
					
					// Calculate wave height based on multiple noise layers
					float wave1 = cnoise(vec3(position.xz * waveFrequency * 0.5, time * 0.5)) * waveHeight;
					float wave2 = cnoise(vec3(position.xz * waveFrequency, time * 0.3)) * waveHeight * 0.5;
					float wave3 = cnoise(vec3(position.xz * waveFrequency * 2.0, time * 0.2)) * waveHeight * 0.25;
					
					// Apply waves with reduced height near edges
					float totalWave = (wave1 + wave2 + wave3) * vEdgeFactor;
					
					// Calculate final position
					vec3 newPosition = position;
					newPosition.y += totalWave;
					
					// Calculate depth for shading
					vDepth = position.y - terrainHeight;
					
					gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
					
					// Calculate normal for lighting
					float eps = 0.01;
					float heightL = cnoise(vec3((position.x - eps) * waveFrequency, position.z * waveFrequency, time));
					float heightR = cnoise(vec3((position.x + eps) * waveFrequency, position.z * waveFrequency, time));
					float heightD = cnoise(vec3(position.x * waveFrequency, (position.z - eps) * waveFrequency, time));
					float heightU = cnoise(vec3(position.x * waveFrequency, (position.z + eps) * waveFrequency, time));
					
					vec3 normal = normalize(vec3(
						heightL - heightR,
						2.0 * eps,
						heightD - heightU
					));
					
					vNormal = normal;
				}
			`,
			fragmentShader: `
				uniform vec3 waterColor;
				uniform vec3 deepWaterColor;
				uniform float waterLevel;
				uniform float waterDepth;
				uniform vec3 foamColor;
				uniform vec3 sandColor;
				uniform float time;
				uniform float radius;
				uniform float edgeWidth;
				
				varying vec2 vUv;
				varying float vDepth;
				varying vec3 vPosition;
				varying vec3 vNormal;
				varying float vEdgeFactor;
				varying float vSandFactor;
				
				void main() {
					// Calculate water color based on depth with a more gradual transition
					float depthFactor = smoothstep(0.0, waterDepth * 2.0, vDepth);
					vec3 finalWaterColor = mix(waterColor, deepWaterColor, depthFactor * 0.7);
					
					// Add foam only at edges, reduce foam in shallow areas
					float edgeFoam = (1.0 - vEdgeFactor) * 0.4; // Reduced from 0.5
					float shallowFoam = (1.0 - depthFactor) * 0.15; // Reduced from 0.3
					float foamFactor = edgeFoam + shallowFoam;
					
					// Apply foam with reduced intensity
					finalWaterColor = mix(finalWaterColor, foamColor, foamFactor * 0.5); // Reduced from 0.7
					
					// Adjust opacity to be more consistent
					float alpha = mix(0.75, 0.92, vEdgeFactor);
					
					gl_FragColor = vec4(finalWaterColor, alpha);
				}
			`,
			transparent: true,
			side: THREE.DoubleSide,
		});

		const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);

		// Create lake entity
		const lake = world.spawn(
			Transform({
				position: new THREE.Vector3(0, 0, 0),
				rotation: new THREE.Euler(0, 0, 0),
				scale: new THREE.Vector3(1, 1, 1),
			}),
			BoxCollider({
				size: new THREE.Vector3(radius * 2, 2.0, radius * 2),
				isTrigger: true,
				layer: CollisionLayer.TERRAIN,
				mask: CollisionLayer.ALL,
			})
		);
		lake.add(Ref(waterMesh));

		// Animate water
		function animateWater() {
			if (waterMaterial.uniforms) {
				waterMaterial.uniforms.time.value += 0.005;
			}
			requestAnimationFrame(animateWater);
		}
		animateWater();

		// Add shore decorations
		const SHORE_DECORATION_COUNT = {
			LARGE_ROCKS: 4,
			SMALL_ROCKS: 12,
			BUSHES: 12,
		};

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

		return { center, radius };
	}

	// Create an old-growth forest with massive trees and dense undergrowth
	createOldGrowthForest(new THREE.Vector3(20, 0, -80));

	// Create a lake in the designated area
	const lake = createLake(world);

	// Create large forest area with varying tree sizes - avoid lake area
	createForestArea(new THREE.Vector3(-60, 0, -60), 40, 0.3); // 30% large trees

	// Create smaller forest areas - check lake distance
	const forestPositions = [
		{ pos: new THREE.Vector3(40, 0, -30), count: 15, largeRatio: 0.2 },
		{ pos: new THREE.Vector3(0, 0, 0), count: 10, largeRatio: 0.1 },
	];

	for (const forest of forestPositions) {
		if (forest.pos.distanceTo(lake.center) > lake.radius + 10) {
			createForestArea(forest.pos, forest.count, forest.largeRatio);
		}
	}

	// Create large rock formations in mountainous areas - avoid lake
	const rockFormationPositions = [
		{ pos: new THREE.Vector3(-30, 0, 30), count: 15, largeRatio: 0.4 },
		{ pos: new THREE.Vector3(20, 0, 40), count: 12, largeRatio: 0.3 },
		{ pos: new THREE.Vector3(10, 0, -10), count: 8, largeRatio: 0.2 },
		{ pos: new THREE.Vector3(-10, 0, 10), count: 8, largeRatio: 0.2 },
	];

	for (const formation of rockFormationPositions) {
		if (formation.pos.distanceTo(lake.center) > lake.radius + 5) {
			createRockFormations(formation.pos, formation.count, formation.largeRatio);
		}
	}

	// Create massive rock formations
	createMassiveRocks();

	// Add scattered bushes with proper height placement (avoiding snow and lake)
	for (let i = 0; i < 50; i++) {
		const x = (Math.random() - 0.5) * 160;
		const z = (Math.random() - 0.5) * 160;
		const pos = new THREE.Vector3(x, 0, z);

		// Check distance from lake
		if (pos.distanceTo(lake.center) > lake.radius + 2) {
			// Check terrain suitability - no bushes in snow
			if (isSuitablePosition(x, z, 0.6, SNOW_HEIGHT)) {
				const y = getTerrainHeightAt(x, z);
				createBush(world, new THREE.Vector3(x, y, z), 0.8 + Math.random() * 0.4);
			}
		}
	}

	environmentCreated = true;
}
