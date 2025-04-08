import { trait } from 'koota';
import * as THREE from 'three';

/**
 * PhysicsBody trait for physics simulation
 * - mass: Mass of the entity in kg (affects force application)
 * - drag: Air resistance factor (0-1)
 * - gravity: Whether gravity affects this body
 * - gravityScale: Multiplier for gravity strength (1.0 = normal)
 * - isKinematic: If true, moved by code rather than physics
 * - isStatic: If true, won't move but affects other bodies
 * - constraints: Movement constraints for each axis
 * - terminalVelocity: Maximum speed in any direction
 * - groundFriction: Friction when in contact with ground
 * - forces: Accumulated forces (reset each frame)
 * - isGrounded: Whether the entity is on the ground
 * - groundNormal: Normal vector of the ground surface
 * - lastGroundedTime: Timestamp of last ground contact
 */
export type PhysicsBodyInstanceType = {
	// Physical properties
	mass: number;
	drag: number;
	gravity: boolean;
	gravityScale: number;

	// Body type
	isKinematic: boolean;
	isStatic: boolean;

	// Movement constraints
	constraints: {
		x: boolean;
		y: boolean;
		z: boolean;
	};

	// Other physics properties
	terminalVelocity: number;
	groundFriction: number;

	// Accumulated forces (reset each frame)
	forces: THREE.Vector3;

	// Tracking ground contact
	isGrounded: boolean;
	groundNormal: THREE.Vector3;
	lastGroundedTime: number;
};

const PHYSICS_BODY_DEFAULTS: Omit<PhysicsBodyInstanceType, 'forces' | 'groundNormal'> = {
	mass: 1.0,
	drag: 0.01,
	gravity: true,
	gravityScale: 1.0,

	isKinematic: false,
	isStatic: false,

	constraints: {
		x: false,
		y: false,
		z: false,
	},

	terminalVelocity: 20,
	groundFriction: 0.3,

	isGrounded: false,
	lastGroundedTime: 0,
};

export const PhysicsBody = trait<() => PhysicsBodyInstanceType>(() => {
	const forces = new THREE.Vector3();
	const groundNormal = new THREE.Vector3(0, 1, 0);

	return { ...PHYSICS_BODY_DEFAULTS, forces, groundNormal };
});

export function getPhysicsBody(options: Partial<PhysicsBodyInstanceType>) {
	const forces = new THREE.Vector3();
	const groundNormal = new THREE.Vector3(0, 1, 0);

	return PhysicsBody({
		forces,
		groundNormal,
		...PHYSICS_BODY_DEFAULTS,
		...options,
	});
}
