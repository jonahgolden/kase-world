import { Entity, World } from 'koota';
import * as THREE from 'three';
import { Transform } from '../traits';

interface BasicEntityProps {
	world: World;
	position?: THREE.Vector3;
	rotation?: THREE.Euler;
	scale?: THREE.Vector3;
}

export function createBasicEntity({
	world,
	position = new THREE.Vector3(),
	rotation = new THREE.Euler(),
	scale = new THREE.Vector3(1, 1, 1),
}: BasicEntityProps): Entity {
	return world.spawn(Transform({ position, rotation, scale }));
}
