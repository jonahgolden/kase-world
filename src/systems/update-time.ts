import { World } from 'koota';
import { Time } from '../traits';

export function updateTime(world: World) {
	const time = world.get(Time)!;
	const now = performance.now();

	// Calculate delta time, handling the initial case
	let delta = 0;
	if (time.current !== 0) {
		delta = Math.min((now - time.current) / 1000, 1 / 30);
	}

	// Create a new Time object with updated values
	const timeUpdate = {
		...time,
		current: now,
		delta: delta,
	};

	// Update the global Time trait
	world.set(Time, timeUpdate);
}
