import { trait } from 'koota';
import * as THREE from 'three';

/**
 * Input trait for free-roam flight:
 * - forward: +1 (W), -1 (S), or 0 (none)
 * - strafe: +1 (D), -1 (A), or 0
 * - boost: true when Space is held
 * - jump: true when Space is pressed for jumping
 * - mouseDelta: frame-by-frame mouse movement (x=Yaw, y=Pitch)
 * - roll: +1 (R), -1 (Q), or 0 for rolling the ship
 * - walk: true when Shift is held for walking mode
 * - scream: true when left mouse button is clicked for scream attack
 */
export const Input = trait({
	forward: 0,
	strafe: 0,
	boost: false,
	jump: false,
	walk: false, // Shift key for walking mode
	roll: 0, // +1 for roll right (R), -1 for roll left (Q)
	scream: false, // Left mouse button for scream attack
	mouseDelta: () => new THREE.Vector2(),
});

// export const Input = trait(() => new THREE.Vector2());
