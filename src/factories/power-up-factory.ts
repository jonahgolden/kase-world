import { Entity, World } from 'koota';
import * as THREE from 'three';
import { CollisionEvents, CollisionLayer, Ref, SphereCollider, Transform } from '../traits';
import { PowerUp, PowerUpType } from '../traits/power-up';

export { PowerUpType } from '../traits/power-up';

const HEALTH_POWERUP_COLOR = '#F44336'; // Red
const SPEED_POWERUP_COLOR = '#2196F3'; // Blue
const STRENGTH_POWERUP_COLOR = '#FFC107'; // Yellow
const INVINCIBILITY_POWERUP_COLOR = '#9C27B0'; // Purple

function getPowerUpColor(type: PowerUpType): string {
	switch (type) {
		case PowerUpType.HEALTH:
			return HEALTH_POWERUP_COLOR;
		case PowerUpType.SPEED:
			return SPEED_POWERUP_COLOR;
		case PowerUpType.STRENGTH:
			return STRENGTH_POWERUP_COLOR;
		case PowerUpType.INVINCIBILITY:
			return INVINCIBILITY_POWERUP_COLOR;
	}
}

export function createPowerUp(world: World, position: THREE.Vector3, type: PowerUpType): Entity {
	const entity = world.spawn(
		Transform({
			position: position.clone(),
			rotation: new THREE.Euler(),
			scale: new THREE.Vector3(0.5, 0.5, 0.5),
		}),
		SphereCollider({
			radius: 0.5,
			layer: CollisionLayer.POWERUP,
			mask: CollisionLayer.CHARACTER,
			isTrigger: true,
		}),
		CollisionEvents(),
		PowerUp({ type })
	);

	// Add mesh with glow effect
	const geometry = new THREE.SphereGeometry(0.5, 16, 16);
	const material = new THREE.MeshStandardMaterial({
		color: getPowerUpColor(type),
		emissive: getPowerUpColor(type),
		emissiveIntensity: 0.5,
		transparent: true,
		opacity: 0.8,
	});
	const mesh = new THREE.Mesh(geometry, material);
	mesh.position.y = 0.5; // Match collider offset
	entity.add(Ref(mesh));

	return entity;
}
