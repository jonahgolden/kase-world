import { trait } from 'koota';
import * as THREE from 'three';

/**
 * PhysicsBody trait for physics simulation
 * - mass: Mass of the entity (affects force application)
 * - drag: Air resistance factor (0-1)
 * - gravity: Whether gravity affects this body
 * - gravityScale: Multiplier for gravity strength (1.0 = normal)
 * - isKinematic: If true, moved by code rather than physics
 * - isStatic: If true, won't move but affects other bodies
 * - constraints: Movement constraints for each axis
 * - terminalVelocity: Maximum speed in any direction
 */
export const PhysicsBody = trait(() => {
	// Create objects once to avoid recreating them
	const forces = new THREE.Vector3();
	const groundNormal = new THREE.Vector3(0, 1, 0);

	return {
		// Physical properties
		mass: 1.0, // Mass in kg
		drag: 0.01, // Air resistance (0-1)
		gravity: true, // Whether gravity affects this body
		gravityScale: 1.0, // Multiplier for gravity strength

		// Body type
		isKinematic: false, // Kinematic bodies are moved by code, not physics
		isStatic: false, // Static bodies don't move but can be collided with

		// Movement constraints
		constraints: {
			x: false, // Lock movement on X axis
			y: false, // Lock movement on Y axis
			z: false, // Lock movement on Z axis
		},

		// Other physics properties
		terminalVelocity: 20, // Max speed in any direction
		groundFriction: 0.3, // Friction when in contact with ground

		// Accumulated forces (reset each frame)
		forces,

		// Tracking ground contact
		isGrounded: false, // Whether the entity is on the ground
		groundNormal, // Normal vector of the ground surface
		lastGroundedTime: 0, // Timestamp of last ground contact
	};
});

export const PHYSICS_BODY_DEFAULTS = {
	// Physical properties
	mass: 1.0, // Mass in kg
	drag: 0.01, // Air resistance (0-1)
	gravity: true, // Whether gravity affects this body
	gravityScale: 1.0, // Multiplier for gravity strength

	// Body type
	isKinematic: false, // Kinematic bodies are moved by code, not physics
	isStatic: false, // Static bodies don't move but can be collided with

	// Movement constraints
	constraints: {
		x: false, // Lock movement on X axis
		y: false, // Lock movement on Y axis
		z: false, // Lock movement on Z axis
	},

	// Other physics properties
	terminalVelocity: 20, // Max speed in any direction
	groundFriction: 0.3, // Friction when in contact with ground

	// Accumulated forces (reset each frame)
	forces: new THREE.Vector3(),

	// Tracking ground contact
	isGrounded: false, // Whether the entity is on the ground
	groundNormal: new THREE.Vector3(0, 1, 0), // Normal vector of the ground surface
	lastGroundedTime: 0, // Timestamp of last ground contact
};
