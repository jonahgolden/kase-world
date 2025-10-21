/**
 * Centralized game configuration
 * All gameplay constants in one place for easy tweaking
 */

export const GAME_CONFIG = {
	// Player configuration
	player: {
		// Health
		health: 100,
		maxHealth: 100,
		invulnerabilityDuration: 0.8, // seconds

		// Movement
		baseThrust: 1.0,
		movementForceMultiplier: 10,
		damping: 0.85,

		// Jump
		crawlJumpForce: 10,
		walkJumpForce: 12,
		jumpCooldown: 0.3, // seconds

		// Movement modes
		crawlSpeed: 1.0, // Relative speed multiplier
		walkSpeed: 1.5, // Relative speed multiplier

		// Collision
		colliderRadius: 0.25, // Half of PLAYER_SCALE (0.5)
		colliderHeight: 0.5, // PLAYER_SCALE
		colliderOffset: { x: 0, y: 0.5, z: 0 },
	},

	// Duogringo boss configuration
	duogringo: {
		// Health
		health: 150,
		maxHealth: 150,

		// AI behavior
		detectionRange: 15, // Distance to start pursuing player
		attackRange: 0.5, // Melee attack range
		attackDuration: 0.5, // seconds before damage applies
		attackCooldown: 2.0, // seconds between attacks
		baseDamage: 20,

		// Movement
		baseSpeed: 1.0,
		movementForceMultiplier: 10,
		damping: 0.85,
		mass: 2,

		// Jump
		jumpForce: 1.5,
		jumpCooldown: 5.0, // seconds

		// Collision
		colliderRadius: 0.3,
		colliderHeight: 0.7,
		colliderOffset: { x: 0, y: 0.6, z: 0 },
	},

	// Scream attack configuration
	scream: {
		baseDamage: 25,
		maxRange: 8, // units
		maxChargeTime: 2.5, // seconds
		effectDuration: 1.5, // seconds
		maxPowerMultiplier: 2.5, // damage multiplier at full charge
		coneAngle: Math.PI / 1.5, // ~120 degrees
		defaultRange: 8, // Default range in units
	},

	// Input configuration
	input: {
		mouseSensitivity: 0.002,
	},

	// Camera configuration
	camera: {
		defaultZoom: 10,
		minZoom: 5,
		maxZoom: 20,
		zoomSpeed: 0.5,
		followSmoothing: 0.1,
	},

	// Physics configuration (references to existing physics constants)
	physics: {
		gravity: -9.8,
		terminalVelocity: 20,
		airDrag: 0.01,
		// See src/constants/physics.ts for more detailed physics constants
	},

	// Spatial hashing configuration
	spatial: {
		cellSize: 5, // Grid cell size for broad-phase collision
	},
} as const;

// Type for accessing game config with type safety
export type GameConfig = typeof GAME_CONFIG;
