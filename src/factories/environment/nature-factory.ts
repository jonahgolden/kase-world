import { Entity, World } from 'koota';
import * as THREE from 'three';
import {
	BoxCollider,
	CollisionLayer,
	DodecahedronCollider,
	Ref,
	SphereCollider,
	Transform,
} from '../../traits';
import { getPhysicsBody } from '../../traits/physics-body';

// Tree configuration
const TREE_COLORS = {
	trunk: '#4a2f1c',
	leaves: '#2d5a27',
};

const ROCK_COLORS = [
	'#808080', // Gray
	'#696969', // Dim Gray
	'#A9A9A9', // Dark Gray
];

/**
 * Creates a simple tree with a trunk and foliage
 */
export function createTree(world: World, position: THREE.Vector3, scale: number = 1): Entity {
	const entity = world.spawn(
		Transform({
			position: position.clone(),
			rotation: new THREE.Euler(0, Math.random() * Math.PI * 2, 0), // Random rotation
			scale: new THREE.Vector3(scale, scale, scale),
		}),
		BoxCollider({
			size: new THREE.Vector3(0.5, 9, 0.5),
			layer: CollisionLayer.TERRAIN,
			mask: CollisionLayer.ALL,
		}),
		// CapsuleCollider({
		// 	radius: 0.3,
		// 	height: 4,
		// 	layer: CollisionLayer.TERRAIN,
		// 	mask: CollisionLayer.ALL,
		// 	offset: new THREE.Vector3(0, 2, 0),
		// }),
		getPhysicsBody({ isStatic: true })
	);

	// Create tree group
	const treeGroup = new THREE.Group();

	// Create trunk
	const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.3, 4, 8);
	const trunkMaterial = new THREE.MeshStandardMaterial({
		color: TREE_COLORS.trunk,
		roughness: 0.9,
		metalness: 0.1,
	});
	const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
	trunk.position.y = 2; // Half height
	treeGroup.add(trunk);

	// Create foliage (multiple layers for more natural look)
	const foliageMaterial = new THREE.MeshStandardMaterial({
		color: TREE_COLORS.leaves,
		roughness: 0.8,
		metalness: 0.1,
	});

	const foliageLayers = [
		{ y: 3.5, scale: 1.0 },
		{ y: 4.0, scale: 0.8 },
		{ y: 4.5, scale: 0.6 },
	];

	foliageLayers.forEach((layer) => {
		const foliageGeometry = new THREE.ConeGeometry(1.5 * layer.scale, 2, 8);
		const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
		foliage.position.y = layer.y;
		treeGroup.add(foliage);
	});

	entity.add(Ref(treeGroup));
	return entity;
}

/**
 * Creates a rock formation
 */
export function createRock(world: World, position: THREE.Vector3, scale: number = 1): Entity {
	const entity = world.spawn(
		Transform({
			position: position.clone(),
			rotation: new THREE.Euler(Math.random() * 0.3, Math.random() * Math.PI * 2, Math.random() * 0.3),
			scale: new THREE.Vector3(scale, scale, scale),
		}),
		DodecahedronCollider({
			radius: 0.8,
			layer: CollisionLayer.TERRAIN,
			mask: CollisionLayer.ALL,
			offset: new THREE.Vector3(0, 0, 0),
		}),
		getPhysicsBody({ isStatic: true })
	);

	// Create rock mesh with basic dodecahedron shape
	const rockGeometry = new THREE.DodecahedronGeometry(0.8, 0);

	const rockMaterial = new THREE.MeshStandardMaterial({
		color: ROCK_COLORS[Math.floor(Math.random() * ROCK_COLORS.length)],
		roughness: 0.8,
		metalness: 0.2,
		flatShading: true, // Keep flat shading for rocky look
	});

	const rockMesh = new THREE.Mesh(rockGeometry, rockMaterial);

	entity.add(Ref(rockMesh));
	return entity;
}

/**
 * Creates a bush or small shrub
 */
export function createBush(world: World, position: THREE.Vector3, scale: number = 1): Entity {
	const entity = world.spawn(
		Transform({
			position: position.clone(),
			rotation: new THREE.Euler(0, Math.random() * Math.PI * 2, 0),
			scale: new THREE.Vector3(scale, scale, scale),
		}),
		SphereCollider({
			radius: 0.5,
			layer: CollisionLayer.TERRAIN,
			mask: CollisionLayer.ALL,
			offset: new THREE.Vector3(0, 0.5, 0),
		}),
		getPhysicsBody({ isStatic: true })
	);

	// Create bush mesh (multiple spheres for more natural look)
	const bushGroup = new THREE.Group();
	const bushMaterial = new THREE.MeshStandardMaterial({
		color: '#1b4d2a',
		roughness: 0.9,
		metalness: 0.1,
	});

	const spherePositions = [
		{ pos: new THREE.Vector3(0, 0.5, 0), scale: 1 },
		{ pos: new THREE.Vector3(0.3, 0.3, 0.3), scale: 0.7 },
		{ pos: new THREE.Vector3(-0.3, 0.4, -0.2), scale: 0.8 },
		{ pos: new THREE.Vector3(0.1, 0.6, -0.3), scale: 0.6 },
	];

	spherePositions.forEach(({ pos, scale }) => {
		const sphereGeometry = new THREE.SphereGeometry(0.5 * scale, 8, 6);
		const sphere = new THREE.Mesh(sphereGeometry, bushMaterial);
		sphere.position.copy(pos);
		bushGroup.add(sphere);
	});

	entity.add(Ref(bushGroup));
	return entity;
}
