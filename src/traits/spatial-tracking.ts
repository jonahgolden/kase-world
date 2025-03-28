import { trait } from 'koota';
import * as THREE from 'three';

/**
 * Spatial tracking trait
 *
 * Tracks the last position and update time of an entity
 * Used to determine if an entity has moved enough to warrant an update in the spatial hash
 *
 * Implementation: A dirty flag system where only moved entities trigger spatial hash updates
 * Reduces collision detection overhead for static objects
 */
export const SpatialTracking = trait({
	lastPosition: () => new THREE.Vector3(),
	lastUpdateTime: 0,
	isDirty: true, // Initially true to ensure first update
});
