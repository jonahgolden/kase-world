import { Entity, World } from 'koota';
import * as THREE from 'three';
import { PLAYER_SPAWN_POSITION } from './actions';
import {
	Collider,
	ColliderType,
	CollisionEvents,
	CollisionLayer,
	Health,
	Input,
	IsCamera,
	IsNPC,
	IsPlayer,
	IsPowerUp,
	IsVehicle,
	Movement,
	MovementMode,
	NPC,
	NPCBehavior,
	NPCSize,
	NPCType,
	PhysicsBody,
	PowerUp,
	PowerUpType,
	Scream,
	Transform,
	Vehicle,
} from './traits';
import { Ref } from './traits/ref';

/**
 * EntityFactory type represents a function that creates an entity with specific traits
 */
export type EntityFactory<T = unknown> = (world: World, options?: T) => Entity;

/**
 * Creates an entity factory function for a specific entity type
 * @param factoryFn The function that creates the entity with the appropriate traits
 * @returns An entity factory function
 */
export function createEntityFactory<T = unknown>(
	factoryFn: (world: World, options?: T) => Entity
): EntityFactory<T> {
	return factoryFn;
}

/**
 * Basic entity options with essential properties
 */
export interface BasicEntityOptions {
	position?: THREE.Vector3;
	rotation?: THREE.Euler;
	scale?: THREE.Vector3;
}

/**
 * Creates a basic entity with just a transform
 */
export const createBasicEntity = createEntityFactory<BasicEntityOptions>((world, options = {}) => {
	const {
		position = new THREE.Vector3(0, 0, 0),
		rotation = new THREE.Euler(0, 0, 0),
		scale = new THREE.Vector3(1, 1, 1),
	} = options;

	return world.spawn(
		Transform({
			position,
			rotation,
			scale,
		})
	);
});

/**
 * Physics entity options
 */
export interface PhysicsEntityOptions extends BasicEntityOptions {
	mass?: number;
	drag?: number;
	isKinematic?: boolean;
	isStatic?: boolean;
	gravity?: boolean;
	gravityScale?: number;
	constraints?: { x: boolean; y: boolean; z: boolean };
	terminalVelocity?: number;
	groundFriction?: number;
	restitution?: number;
	// Collider options
	colliderType?: ColliderType;
	colliderRadius?: number;
	colliderHeight?: number;
	colliderSize?: THREE.Vector3;
	colliderOffset?: THREE.Vector3;
	colliderLayer?: number;
	colliderMask?: number;
	colliderFriction?: number;
	colliderRestitution?: number;
	isTrigger?: boolean;
	// Visual options
	color?: string;
	opacity?: number;
	addVisualMesh?: boolean;
}

/**
 * Creates an entity with physics properties
 * For consistency, all non-character entities should use colliderOffset=(0,0,0)
 * and position their meshes at the appropriate height in the world.
 * Character entities use colliderOffset to support their unique shapes.
 */
export const createPhysicsEntity = createEntityFactory<PhysicsEntityOptions>((world, options = {}) => {
	const {
		position = new THREE.Vector3(0, 0, 0),
		rotation = new THREE.Euler(0, 0, 0),
		scale = new THREE.Vector3(1, 1, 1),
		mass = 1.0,
		drag = 0.01,
		isKinematic = false,
		isStatic = false,
		gravity = true,
		gravityScale = 1.0,
		constraints = { x: false, y: false, z: false },
		terminalVelocity = 20,
		groundFriction = 0.3,
		restitution = 0.1,
		// Collider defaults
		colliderType = ColliderType.BOX,
		colliderRadius = 0.5,
		colliderHeight = 1.0,
		colliderSize = new THREE.Vector3(1, 1, 1),
		colliderOffset = new THREE.Vector3(0, 0, 0),
		colliderLayer = CollisionLayer.DEFAULT,
		colliderMask = CollisionLayer.DEFAULT | CollisionLayer.CHARACTER | CollisionLayer.TRIGGER,
		colliderFriction = 0.3,
		colliderRestitution = 0.1,
		isTrigger = false,
		// Visual options
		color = '#cccccc',
		opacity = 0.7,
		addVisualMesh = false,
	} = options;

	// First create a basic entity with transform
	const entity = createBasicEntity(world, { position, rotation, scale });

	// Add physics body
	entity.add(
		PhysicsBody({
			mass,
			drag,
			isKinematic,
			isStatic,
			gravity,
			gravityScale,
			constraints,
			terminalVelocity,
			groundFriction,
			restitution,
			forces: new THREE.Vector3(),
			isGrounded: false,
			groundNormal: new THREE.Vector3(0, 1, 0),
			lastGroundedTime: 0,
		})
	);

	// Add movement
	entity.add(
		Movement({
			velocity: new THREE.Vector3(),
			thrust: 1.0,
			damping: 0.95,
			force: new THREE.Vector3(),
		})
	);

	// Add collider
	entity.add(
		Collider({
			type: colliderType,
			radius: colliderRadius,
			height: colliderHeight,
			size: colliderSize,
			offset: colliderOffset,
			layer: colliderLayer,
			mask: colliderMask,
			friction: colliderFriction,
			restitution: colliderRestitution,
			isTrigger: isTrigger,
		})
	);

	// Add collision events
	entity.add(CollisionEvents());

	// Add a mesh for visualization if requested
	if (addVisualMesh) {
		// Create geometry based on collider type
		const geometry =
			colliderType === ColliderType.SPHERE
				? new THREE.SphereGeometry(colliderRadius)
				: colliderType === ColliderType.CAPSULE
				? new THREE.CapsuleGeometry(colliderRadius, colliderHeight)
				: new THREE.BoxGeometry(colliderSize.x, colliderSize.y, colliderSize.z);

		// Create material
		const material = new THREE.MeshStandardMaterial({
			color,
			transparent: opacity < 1.0,
			opacity,
		});

		// Create the mesh
		const mesh = new THREE.Mesh(geometry, material);

		// Create a group to properly position the mesh with the collider offset
		// This ensures the mesh visual matches the collision wireframe positioning
		const group = new THREE.Group();
		group.position.copy(colliderOffset);
		group.add(mesh);

		// Add the group with Ref trait
		entity.add(Ref(group));

		// Add collision event handlers that change the color
		const collisionEvents = entity.get(CollisionEvents);
		if (collisionEvents) {
			collisionEvents.onCollisionEnter.add(() => {
				material.color.set('#ff0000'); // Red on collision
			});

			collisionEvents.onCollisionExit.add(() => {
				material.color.set(color); // Reset color
			});
		}
	}

	return entity;
});

/**
 * Character entity options
 */
export interface CharacterEntityOptions extends PhysicsEntityOptions {
	health?: number;
	maxHealth?: number;
	thrust?: number;
	damping?: number;
}

/**
 * Creates a character entity with health and physics
 */
export const createCharacterEntity = createEntityFactory<CharacterEntityOptions>((world, options = {}) => {
	const {
		health = 100,
		maxHealth = 100,
		position = new THREE.Vector3(0, 0, 0),
		colliderType = ColliderType.CAPSULE,
		colliderRadius = 0.2,
		colliderHeight = 0.4,
		colliderOffset = new THREE.Vector3(0, 0.4, 0),
		colliderLayer = CollisionLayer.CHARACTER,
		colliderMask = CollisionLayer.DEFAULT | CollisionLayer.TRIGGER | CollisionLayer.CHARACTER,
		thrust = 1.0,
		damping = 0.95,
	} = options;

	// Create physics entity as base with character-specific adjustments
	const entity = createPhysicsEntity(world, {
		...options,
		colliderType,
		colliderRadius,
		colliderHeight,
		colliderOffset,
		colliderLayer,
		colliderMask,
	});

	// Update Movement with character-specific values
	if (entity.has(Movement)) {
		entity.set(Movement, {
			...entity.get(Movement)!,
			thrust,
			damping,
		});
	}

	// Add health component
	entity.add(
		Health({
			current: health,
			max: maxHealth,
			invulnerabilityTimer: 0,
			isDamaged: false,
		})
	);

	return entity;
});

/**
 * Creates the Player entity
 */
export const createPlayerEntity = createEntityFactory<CharacterEntityOptions>((world, options = {}) => {
	const { position = PLAYER_SPAWN_POSITION.clone(), thrust = 5.0 } = options;

	const entity = createCharacterEntity(world, {
		...options,
		position,
		thrust,
		colliderRadius: 0.2,
		colliderHeight: 0.4,
		colliderOffset: new THREE.Vector3(0, 0.4, 0),
		damping: 0.85, // Higher damping for baby
	});

	// Add player tag and traits
	entity.add(IsPlayer);
	entity.add(Input());

	// Add movement mode
	entity.add(MovementMode());

	// Add scream ability
	entity.add(Scream());

	return entity;
});

/**
 * Creates a camera entity
 */
export const createCameraEntity = createEntityFactory<BasicEntityOptions>((world, options = {}) => {
	const { position = new THREE.Vector3(0, 1.5, 4) } = options;

	return world.spawn(
		Transform({
			position,
			rotation: new THREE.Euler(0, 0, 0),
			scale: new THREE.Vector3(1, 1, 1),
		}),
		IsCamera
	);
});

/**
 * NPC base options
 */
export interface NPCOptions extends CharacterEntityOptions {
	npcType?: 'chicken' | 'human' | 'centaur';
	size?: 'small' | 'large';
	behavior?: 'passive' | 'aggressive' | 'defensive';
}

/**
 * Creates an NPC entity with customizable type and behavior
 */
export const createNPCEntity = createEntityFactory<NPCOptions>((world, options = {}) => {
	const {
		npcType = 'chicken',
		size = 'small',
		behavior = 'passive',
		position = new THREE.Vector3(0, 0, 0),
		health = 100,
		maxHealth = 100,
	} = options;

	// Scale factors based on NPC type and size
	const scaleFactor = size === 'large' ? 1.5 : 1.0;
	const heightFactor = npcType === 'human' ? 1.7 : npcType === 'centaur' ? 2.0 : 1.0;

	// Adjust collider size based on NPC type and size
	const colliderRadius = 0.3 * scaleFactor;
	const colliderHeight = 0.6 * heightFactor * scaleFactor;
	const colliderOffset = new THREE.Vector3(0, colliderHeight / 2, 0);

	// Create base character entity
	const entity = createCharacterEntity(world, {
		...options,
		position,
		health,
		maxHealth,
		colliderType: ColliderType.CAPSULE,
		colliderRadius,
		colliderHeight,
		colliderOffset,
		scale: new THREE.Vector3(scaleFactor, scaleFactor, scaleFactor),
		// Physics properties based on type
		mass: size === 'large' ? 3.0 : 1.0,
		drag: 0.05,
		gravity: true,
		// Movement properties based on type and behavior
		thrust: behavior === 'aggressive' ? 4.0 : behavior === 'defensive' ? 5.0 : 3.0,
		damping: 0.9,
	});

	// Add NPC tag and trait
	entity.add(IsNPC);
	entity.add(
		NPC({
			type: npcType as NPCType,
			size: size as NPCSize,
			behavior: behavior as NPCBehavior,
			targetEntity: null,
			state: 'idle',
			lastStateChange: 0,
		})
	);

	return entity;
});

/**
 * Power-up options
 */
export interface PowerUpOptions extends BasicEntityOptions {
	powerUpType?: 'health' | 'speed' | 'damage' | 'invulnerability';
	duration?: number;
	strength?: number;
}

/**
 * Creates a power-up entity
 */
export const createPowerUpEntity = createEntityFactory<PowerUpOptions>((world, options = {}) => {
	const {
		position = new THREE.Vector3(0, 0.5, 0),
		powerUpType = 'health',
		duration = 5.0,
		strength = 1.0,
	} = options;

	// Determine color based on power-up type
	const powerUpColor =
		powerUpType === 'health'
			? '#ff5555'
			: powerUpType === 'speed'
			? '#55ff55'
			: powerUpType === 'damage'
			? '#5555ff'
			: '#ffff55'; // invulnerability

	// Create physics entity as base with power-up specific properties
	const entity = createPhysicsEntity(world, {
		position,
		// Make it floating and not affected by physics
		isKinematic: true,
		gravity: false,
		// Collider settings for pickup
		colliderType: ColliderType.SPHERE,
		colliderRadius: 0.5,
		colliderOffset: new THREE.Vector3(0, 0, 0), // Zero offset
		colliderLayer: CollisionLayer.TRIGGER,
		colliderMask: CollisionLayer.CHARACTER,
		colliderFriction: 0.0,
		colliderRestitution: 0.0,
		isTrigger: true,
		// Add visual representation
		color: powerUpColor,
		opacity: 0.8,
		addVisualMesh: true,
	});

	// Add power-up tag and trait
	entity.add(IsPowerUp);
	entity.add(
		PowerUp({
			type: powerUpType as PowerUpType,
			duration,
			strength,
			isCollected: false,
			collectedBy: null,
		})
	);

	return entity;
});

/**
 * Vehicle options
 */
export interface VehicleOptions extends PhysicsEntityOptions {
	vehicleType?: 'car' | 'tricycle' | 'wagon';
	maxSpeed?: number;
	acceleration?: number;
}

/**
 * Creates a vehicle entity
 */
export const createVehicleEntity = createEntityFactory<VehicleOptions>((world, options = {}) => {
	const {
		position = new THREE.Vector3(0, 0.5, 0),
		vehicleType = 'car',
		maxSpeed = 10.0,
		acceleration = 2.0,
	} = options;

	// Determine color based on vehicle type
	const vehicleColor = vehicleType === 'car' ? '#3366aa' : vehicleType === 'tricycle' ? '#aa3366' : '#66aa33'; // wagon

	// Adjust size based on vehicle type
	const vehicleSize =
		vehicleType === 'car'
			? new THREE.Vector3(2.0, 1.0, 1.0)
			: vehicleType === 'tricycle'
			? new THREE.Vector3(1.0, 0.7, 0.7)
			: new THREE.Vector3(1.5, 0.8, 1.0); // wagon

	// Create physics entity as base with vehicle-specific properties
	const entity = createPhysicsEntity(world, {
		...options,
		position,
		mass: vehicleType === 'car' ? 5.0 : vehicleType === 'tricycle' ? 2.0 : 3.0,
		drag: 0.03,
		colliderType: ColliderType.BOX,
		colliderSize: vehicleSize,
		colliderOffset: new THREE.Vector3(0, 0, 0), // Zero offset
		colliderLayer: CollisionLayer.CHARACTER,
		colliderMask: CollisionLayer.DEFAULT | CollisionLayer.CHARACTER | CollisionLayer.TRIGGER,
		colliderFriction: 0.5,
		colliderRestitution: 0.1,
		// Add visual representation
		color: vehicleColor,
		opacity: 0.9,
		addVisualMesh: true,
	});

	// Add vehicle tag and trait
	entity.add(IsVehicle);
	entity.add(
		Vehicle({
			type: vehicleType as 'car' | 'tricycle' | 'wagon',
			maxSpeed,
			acceleration,
			isOccupied: false,
			driver: null,
		})
	);

	// Set movement properties based on vehicle specs
	entity.set(Movement, {
		velocity: new THREE.Vector3(),
		thrust: acceleration,
		damping: 1.0 - 0.1 / maxSpeed,
		force: new THREE.Vector3(),
	});

	return entity;
});
