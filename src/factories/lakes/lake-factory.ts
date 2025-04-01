import { World } from 'koota';
import * as THREE from 'three';
import { BoxCollider, CollisionLayer, Ref, Transform } from '../../traits';
import { FRAGMENT_SHADER, LAKES_DATA, LakeData, VERTEX_SHADER } from './const';

export function createLakes(world: World, getTerrainHeightAt: (x: number, z: number) => number) {
	return LAKES_DATA.map((lakeData) => createLake(world, lakeData, getTerrainHeightAt));
}

// Create a lake with natural shoreline
export function createLake(
	world: World,
	lakeData: LakeData,
	getTerrainHeightAt: (x: number, z: number) => number
) {
	const { center, radius, waterLevel: lakeEdgeHeight } = lakeData;

	// Lake parameters
	const segments = 64;
	const waterLevel = lakeEdgeHeight - 0.3 - Math.random() * 0.5;
	const transitionWidth = radius * 0.8;

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

			// Vertex position always at waterLevel
			positions.push(x, waterLevel, z);
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
		vertexShader: VERTEX_SHADER,
		fragmentShader: FRAGMENT_SHADER,
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

	return lake;
}
