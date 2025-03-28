import { Entity, World } from 'koota';
import * as THREE from 'three';
import { BoxCollider, CollisionLayer, Ref, Transform } from '../traits';

const TRIGGER_ZONE_COLOR = '#B39DDB';

/**
 * Creates a trigger volume that detects when objects enter/exit
 */
export function createTriggerZone(
	world: World,
	position: THREE.Vector3,
	size: THREE.Vector3 = new THREE.Vector3(2, 2, 2)
): Entity {
	const entity = world.spawn(
		Transform({
			position: position.clone(),
			rotation: new THREE.Euler(),
			scale: new THREE.Vector3(1, 1, 1),
		}),
		BoxCollider({
			size: size.clone(),
			layer: CollisionLayer.TERRAIN,
			mask: CollisionLayer.CHARACTER,
			isTrigger: true,
		})
	);

	// Add semi-transparent mesh
	const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
	const material = new THREE.MeshStandardMaterial({
		color: TRIGGER_ZONE_COLOR,
		transparent: true,
		opacity: 0.3,
	});
	const mesh = new THREE.Mesh(geometry, material);
	entity.add(Ref(mesh));

	return entity;
}
