import { trait } from 'koota';

/**
 * Tag trait for identifying NPC entities
 */
export const IsNPC = trait();

/**
 * NPC types
 */
export type NPCType = 'chicken' | 'human' | 'centaur';

/**
 * NPC size variants
 */
export type NPCSize = 'small' | 'large';

/**
 * NPC behavior patterns
 */
export type NPCBehavior = 'passive' | 'aggressive' | 'defensive';

/**
 * Trait for tracking NPC properties
 */
export const NPC = trait({
	type: 'chicken' as NPCType,
	size: 'small' as NPCSize,
	behavior: 'passive' as NPCBehavior,
	targetEntity: null as number | null, // Entity ID of the current target, if any
	state: 'idle' as 'idle' | 'walking' | 'attacking' | 'fleeing',
	lastStateChange: 0, // Timestamp of the last state change
});
