import { World } from 'koota';
import { Input, IsPlayer } from '../traits';

// We'll keep a simple in-memory state of the keys and mouse movement.
const state = {
	forward: 0, // +1 when W is down, -1 when S is down
	strafe: 0, // +1 when D is down, -1 when A is down
	boost: false, // true when SPACE is down
	jump: false, // true when SPACE is down for jumping
	walk: false, // true when SHIFT is down for walking
	roll: 0, // +1 when R is down, -1 when Q is down
	scream: false, // true when left mouse button is clicked
	mouseDeltaX: 0,
	mouseDeltaY: 0,
	pointerLocked: false,
};

// Function to request pointer lock
const requestPointerLock = () => {
	const canvas = document.querySelector('canvas');
	if (canvas && !state.pointerLocked) {
		canvas.requestPointerLock =
			canvas.requestPointerLock ||
			(canvas as HTMLCanvasElement).mozRequestPointerLock ||
			(canvas as HTMLCanvasElement).webkitRequestPointerLock;

		canvas.requestPointerLock();
	}
};

// Function to handle pointer lock change
const handlePointerLockChange = () => {
	state.pointerLocked =
		document.pointerLockElement === document.querySelector('canvas') ||
		(document as Document).mozPointerLockElement === document.querySelector('canvas') ||
		(document as Document).webkitPointerLockElement === document.querySelector('canvas');
};

// Set up pointer lock event listeners
document.addEventListener('pointerlockchange', handlePointerLockChange);
document.addEventListener('mozpointerlockchange', handlePointerLockChange);
document.addEventListener('webkitpointerlockchange', handlePointerLockChange);

// Listen for key presses
window.addEventListener('keydown', (e) => {
	switch (e.key.toLowerCase()) {
		case 'w':
		case 'arrowup':
			state.forward = 1;
			break;
		case 's':
		case 'arrowdown':
			state.forward = -1;
			break;
		case 'a':
		case 'arrowleft':
			state.strafe = -1;
			break;
		case 'd':
		case 'arrowright':
			state.strafe = 1;
			break;
		case ' ':
			state.boost = true;
			state.jump = true; // Add jump state for space key
			break;
		case 'q':
			state.roll = -1; // Roll left
			break;
		case 'r':
			state.roll = 1; // Roll right
			break;
		case 'shift':
			state.walk = true; // Enable walk mode with shift key
			break;
	}

	// Request pointer lock on any key press if not already locked
	requestPointerLock();
});

// Listen for mouse clicks
window.addEventListener('mousedown', (e) => {
	if (e.button === 0) {
		// Left mouse button
		state.scream = true;

		// Request pointer lock if not already locked
		if (!state.pointerLocked) {
			requestPointerLock();
		}
	}
});

window.addEventListener('mouseup', (e) => {
	if (e.button === 0) {
		// Left mouse button
		state.scream = false;
	}
});

window.addEventListener('keyup', (e) => {
	switch (e.key.toLowerCase()) {
		case 'w':
		case 'arrowup':
			state.forward = 0;
			break;
		case 's':
		case 'arrowdown':
			state.forward = 0;
			break;
		case 'a':
		case 'arrowleft':
			state.strafe = 0;
			break;
		case 'd':
		case 'arrowright':
			state.strafe = 0;
			break;
		case ' ':
			state.boost = false;
			state.jump = false; // Reset jump state when space key is released
			break;
		case 'q':
			if (state.roll === -1) state.roll = 0; // Only reset if this key caused the roll
			break;
		case 'r':
			if (state.roll === 1) state.roll = 0; // Only reset if this key caused the roll
			break;
		case 'shift':
			state.walk = false; // Disable walk mode when shift is released
			break;
	}
});

// Listen for mouse movement
window.addEventListener('mousemove', (e) => {
	// Only accumulate movement deltas if pointer is locked
	if (state.pointerLocked) {
		// Accumulate movement deltas
		state.mouseDeltaX += e.movementX;
		state.mouseDeltaY += e.movementY;
	}
});

/**
 * pollInput system:
 * Pushes our key/mouse state into each player entity's Input component.
 */
export function pollInput(world: World) {
	world.query(IsPlayer, Input).updateEach(([input]) => {
		// Transfer keyboard/boost state
		input.forward = state.forward;
		input.strafe = state.strafe;
		input.boost = state.boost;
		input.roll = state.roll;
		input.jump = state.jump; // Update jump state in Input trait
		input.walk = state.walk; // Update walk state in Input trait
		input.scream = state.scream; // Update scream state in Input trait
		// Copy mouse delta
		input.mouseDelta.set(state.mouseDeltaX, state.mouseDeltaY);
	});

	// Reset the mouse delta after we've used it this frame
	state.mouseDeltaX = 0;
	state.mouseDeltaY = 0;
}
