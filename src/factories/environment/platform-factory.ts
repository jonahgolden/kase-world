import { Entity, World } from 'koota';
import * as THREE from 'three';
import { BoxCollider, CollisionLayer, getPhysicsBody, Ref, Transform } from '../../traits';
import { TERRAIN_COLORS } from './terrain-factory';

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
		getPhysicsBody({ isStatic: true })
	);

	// Create mesh
	const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
	const material = new THREE.MeshStandardMaterial({
		color: TERRAIN_COLORS.PLATFORM,
		roughness: 0.9,
		metalness: 0.1,
	});
	const mesh = new THREE.Mesh(geometry, material);
	entity.add(Ref(mesh));

	return entity;
}
