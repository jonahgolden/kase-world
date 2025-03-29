import { trait } from 'koota';

/**
 * CameraZoom trait for controlling camera distance
 * - distance: Current zoom distance
 * - minDistance: Minimum allowed zoom distance
 * - maxDistance: Maximum allowed zoom distance
 * - zoomSpeed: Speed of zoom when scrolling
 */
export const CameraZoom = trait({
	distance: 3,
	minDistance: 3,
	maxDistance: 8,
	zoomSpeed: 0.5,
});
