import { Entity, trait } from 'koota';

type CollisionEventsInstanceType = {
	// Entities currently in contact with this entity (updated each frame)
	contacts: Set<number>; // Stores entity IDs for fast lookups

	// Callbacks for collision events
	onCollisionEnter: Set<(other: Entity) => void>;
	onCollisionStay: Set<(other: Entity) => void>;
	onCollisionExit: Set<(other: Entity) => void>;

	// Callbacks for trigger events
	onTriggerEnter: Set<(other: Entity) => void>;
	onTriggerStay: Set<(other: Entity) => void>;
	onTriggerExit: Set<(other: Entity) => void>;
};

const COLLISION_EVENTS_DEFAULTS: CollisionEventsInstanceType = {
	contacts: new Set<number>(),
	onCollisionEnter: new Set<(other: Entity) => void>(),
	onCollisionStay: new Set<(other: Entity) => void>(),
	onCollisionExit: new Set<(other: Entity) => void>(),
	onTriggerEnter: new Set<(other: Entity) => void>(),
	onTriggerStay: new Set<(other: Entity) => void>(),
	onTriggerExit: new Set<(other: Entity) => void>(),
};

/**
 * Trait to store collision events and callbacks
 */
export const CollisionEvents = trait<() => CollisionEventsInstanceType>(() => COLLISION_EVENTS_DEFAULTS);

/**
 * Creates a collision events trait with the specified options
 * @param options Partial collision events configuration
 */
export function createCollisionEvents(options: Partial<CollisionEventsInstanceType>) {
	return CollisionEvents({
		...COLLISION_EVENTS_DEFAULTS,
		...options,
	});
}
