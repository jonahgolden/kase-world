import { World } from 'koota';
import { Input, IsBaby, Movement, MovementMode, Transform } from '../traits';
import { Time } from '../traits/time';

// Jump settings
const JUMP_FORCE = {
	crawl: 10, // Lower jump force when crawling
	walk: 12, // Higher jump force when walking
};
const GRAVITY = 20; // Gravity strength
const MAX_JUMP_HEIGHT = 1.5; // Increased jump height (about 5x baby's height)
const GROUND_LEVEL = 0.5; // Raised ground level so baby stands on ground

// Simple state object to track if the space was pressed in the previous frame
let wasJumpPressed = false;

export function babyJump(world: World) {
	const time = world.get(Time);
	if (!time) return;

	// Find entities that have the baby trait
	const babyEntities = world.entities.filter(
		(e) => e && e.has(IsBaby) && e.has(Input) && e.has(Movement) && e.has(Transform)
	);

	// Process each entity with proper access to traits
	for (const entity of babyEntities) {
		const input = entity.get(Input);
		const movement = entity.get(Movement);
		const transform = entity.get(Transform);
		const movementMode = entity.get(MovementMode);

		if (!input || !movement || !transform) continue;

		// Get the current movement mode
		const mode = movementMode?.mode || 'crawl';

		// Track if we need to update traits
		let transformUpdated = false;
		let movementUpdated = false;
		const transformUpdate = { ...transform };
		const movementUpdate = { ...movement };

		// Check if the baby is on the ground
		const isOnGround = transform.position.y <= GROUND_LEVEL + 0.01;

		// Apply gravity when in the air
		if (transform.position.y > GROUND_LEVEL) {
			movementUpdate.velocity.y = movement.velocity.y - GRAVITY * time.delta;
			movementUpdated = true;
		} else if (movement.velocity.y < 0) {
			// Snap to ground and stop falling when hitting the ground
			transformUpdate.position.y = GROUND_LEVEL;
			transformUpdated = true;
			movementUpdate.velocity.y = 0;
			movementUpdated = true;
		}

		// Detect jump button press (only on the first frame it's pressed)
		const jumpPressed = input.jump && !wasJumpPressed;

		// Initiate jump only when on the ground and jump just pressed
		if (jumpPressed && isOnGround) {
			// Apply upward force based on movement mode
			const jumpForce = mode === 'walk' ? JUMP_FORCE.walk : JUMP_FORCE.crawl;
			movementUpdate.velocity.y = jumpForce;
			movementUpdated = true;
		}

		// Cap the maximum jump height by limiting upward velocity
		if (transform.position.y > GROUND_LEVEL + MAX_JUMP_HEIGHT && movement.velocity.y > 0) {
			movementUpdate.velocity.y = 0; // Stop rising once max height is reached
			movementUpdated = true;
		}

		// Apply updates if needed
		if (transformUpdated) {
			entity.set(Transform, transformUpdate);
		}

		if (movementUpdated) {
			entity.set(Movement, movementUpdate);
		}

		// Track jump button state for next frame
		wasJumpPressed = input.jump;
	}
}
