import { World } from 'koota';
import * as THREE from 'three';
import { actions } from '../actions';
import { ActiveScream, Health, Input, IsPlayer, Scream, Time, Transform } from '../traits';

// Scream attack parameters
const BASE_DAMAGE = 25; // Base damage at closest range
const MAX_RANGE = 8; // Maximum range in units
const MAX_CHARGE_TIME = 2.5; // Maximum charge time in seconds
const EFFECT_DURATION = 1.5; // How long the effect stays visible in seconds
const MAX_POWER_MULTIPLIER = 2.5; // Maximum power multiplier for fully charged scream

// Track if the scream was pressed in the previous frame
let wasScreamPressed = false;

// Export for use in scream-effect.tsx
export const calculateRingCount = (chargeRatio: number): number => {
	// Start with 1 ring, up to 5 rings at full charge
	return Math.max(1, Math.floor(1 + chargeRatio * 4));
};

/**
 * Detects if entity is in the cone of effect
 */
function isInCone(
	sourcePosition: THREE.Vector3,
	sourceRotation: THREE.Euler,
	targetPosition: THREE.Vector3,
	range: number,
	angle: number
): boolean {
	// Calculate direction vector from source to target
	const toTarget = new THREE.Vector3().subVectors(targetPosition, sourcePosition);

	// Ignore Y component for a more forgiving horizontal cone
	toTarget.y = 0;

	// Check if entity is within range
	const distance = toTarget.length();
	if (distance > range) return false;

	// Get the forward direction vector of the source
	const forwardDir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, sourceRotation.y, 0));

	// Normalize for angle calculation
	toTarget.normalize();

	// Calculate dot product (cosine of angle between vectors)
	const dotProduct = forwardDir.dot(toTarget);

	// Convert half cone angle to cosine for comparison
	const cosHalfAngle = Math.cos(angle / 2);

	// Entity is in cone if dot product is greater than the cosine of the half angle
	return dotProduct > cosHalfAngle;
}

/**
 * Calculate damage based on distance and charge
 */
function calculateDamage(
	distance: number,
	baseDamage: number,
	maxRange: number,
	chargeRatio: number
): number {
	// Linear falloff based on distance
	const falloff = 1 - Math.min(distance / maxRange, 1);

	// Calculate power multiplier based on charge ratio
	const powerMultiplier = 1 + (MAX_POWER_MULTIPLIER - 1) * chargeRatio;

	return Math.floor(baseDamage * falloff * powerMultiplier);
}

/**
 * Baby scream attack system
 */
export function babyScreamSystem(world: World) {
	// Get the time trait for delta time
	const time = world.get(Time);
	if (!time) return;

	// Find baby entity and associated traits
	const player = world.queryFirst(IsPlayer, Input, Transform, Scream);
	if (!player) return;

	const input = player.get(Input);
	const transform = player.get(Transform);
	const scream = player.get(Scream);

	if (!input || !transform || !scream) return;

	// Get bound actions for this world instance
	const boundActions = actions(world);

	// Get all entities with health that could be affected by scream
	const entitiesWithHealth = world.entities.filter(
		(entity) => entity && entity.has(Health) && entity.has(Transform) && !entity.has(IsPlayer)
	);

	// Create an object to collect all scream changes
	const screamUpdates = { ...scream };
	let screamHasUpdates = false;

	// Get the current scream input state
	const screamButtonDown = input.scream;
	const screamButtonPressed = screamButtonDown && !wasScreamPressed;
	const screamButtonReleased = !screamButtonDown && wasScreamPressed;

	// Update previous state
	wasScreamPressed = screamButtonDown;

	// CHARGING: Start charging if button is pressed and cooldown is done
	if (screamButtonPressed && scream.cooldown <= 0) {
		screamHasUpdates = true;

		screamUpdates.isCharging = true;
		screamUpdates.chargeTime = 0;
	}

	// Continue charging if button is held down
	if (screamButtonDown && scream.isCharging) {
		screamHasUpdates = true;

		// Increment charge time, but cap at max charge time
		const newChargeTime = Math.min(scream.chargeTime + time.delta, MAX_CHARGE_TIME);

		screamUpdates.chargeTime = newChargeTime;
	}

	// RELEASE: Activate scream when button is released after charging
	if (screamButtonReleased && scream.isCharging) {
		screamHasUpdates = true;

		// Calculate charge ratio (0-1)
		const chargeRatio = scream.chargeTime / MAX_CHARGE_TIME;

		// Set cooldown based on charge time
		const cooldownTime = scream.chargeTime;

		// Create a new active scream and add it to the array
		const newScream: ActiveScream = {
			id: scream.nextScreamId,
			effectTimer: EFFECT_DURATION,
			chargeAmount: scream.chargeTime,
		};

		// Get the latest state of the scream trait before modifying
		screamUpdates.cooldown = cooldownTime;
		screamUpdates.isCharging = false;
		screamUpdates.chargeTime = 0;
		screamUpdates.activeScreams.push(newScream);
		screamUpdates.nextScreamId++;

		// Apply damage to entities in the cone
		if (entitiesWithHealth.length > 0) {
			entitiesWithHealth.forEach((targetEntity) => {
				if (!targetEntity || !targetEntity.has(Transform)) return;

				const targetTransform = targetEntity.get(Transform);
				if (!targetTransform) return;

				// Check if entity is in cone
				if (
					isInCone(
						transform.position,
						transform.rotation,
						targetTransform.position,
						scream.range,
						scream.angle
					)
				) {
					// Calculate distance for damage falloff
					const distance = transform.position.distanceTo(targetTransform.position);
					const damage = calculateDamage(distance, BASE_DAMAGE, MAX_RANGE, chargeRatio);

					// Apply damage
					boundActions.applyDamage(targetEntity, damage);
					console.log(`Applied ${damage} damage to entity at distance ${distance.toFixed(2)}`);
				}
			});
		}
	}

	// Update all active scream timers
	if (scream.activeScreams.length > 0) {
		screamHasUpdates = true;

		// Update each active scream
		const updatedScreams = scream.activeScreams.map((activeScream) => ({
			...activeScream,
			effectTimer: Math.max(0, activeScream.effectTimer - time.delta),
		}));

		// Filter out expired screams
		const remainingScreams = updatedScreams.filter((s) => s.effectTimer > 0);

		// Only update the trait if there's a change
		if (
			remainingScreams.length !== scream.activeScreams.length ||
			updatedScreams.some(
				(s) => s.effectTimer !== scream.activeScreams.find((as) => as.id === s.id)?.effectTimer
			)
		) {
			screamUpdates.activeScreams = remainingScreams;
		}
	}

	// Update cooldown timer (always decrease regardless of active state) - MOVED TO END OF SYSTEM
	if (scream.cooldown > 0) {
		screamHasUpdates = true;

		screamUpdates.cooldown = Math.max(0, scream.cooldown - time.delta);
	}

	if (screamHasUpdates) {
		player.set(Scream, screamUpdates);
	}
}
