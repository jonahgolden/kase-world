import { World } from 'koota';
import { SystemPriority, SystemTiming } from '../traits';

/**
 * Check if a system should run based on its priority and last update time
 * @param world The game world
 * @param systemName Unique name of the system
 * @param priority Priority level of the system
 * @returns boolean indicating if the system should run this frame
 */
export function shouldRunSystem(world: World, systemName: string, priority: SystemPriority): boolean {
	const timing = world.get(SystemTiming);
	if (!timing) return true; // If no timing trait, run every time

	const now = performance.now();
	const lastUpdate = timing.lastUpdateTime[systemName] || 0;
	const interval = timing.updateIntervals[priority];

	// Always run CRITICAL priority systems
	if (priority === SystemPriority.CRITICAL) {
		timing.lastUpdateTime[systemName] = now;
		return true;
	}

	// Check if enough time has passed since last update
	if (now - lastUpdate >= interval) {
		timing.lastUpdateTime[systemName] = now;
		return true;
	}

	return false;
}
