import { World } from 'koota';

// Track wheel delta at the world level
let wheelDelta = 0;

// Handle wheel events
window.addEventListener('wheel', (e) => {
	wheelDelta = Math.sign(e.deltaY) * 0.1; // Normalize the wheel delta
});

export function inputSystem(world: World) {
	// Store wheel delta in world state
	(world as any).wheelDelta = wheelDelta;
	wheelDelta = 0; // Reset for next frame

	// ... rest of the input system code ...
}
