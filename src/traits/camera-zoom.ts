import { trait } from 'koota';

/**
 * CameraZoom trait for controlling camera distance
 * - distance: Current zoom distance
 * - minDistance: Minimum allowed zoom distance
 * - maxDistance: Maximum allowed zoom distance
 * - zoomSpeed: Speed of zoom when scrolling
 */
export const CameraZoom = trait({
	distance: 4, // Default distance matches the original camera offset
	minDistance: 2, // Minimum zoom distance
	maxDistance: 8, // Maximum zoom distance
	zoomSpeed: 0.5, // Zoom speed multiplier
});
