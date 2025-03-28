import { trait } from 'koota';

export enum SystemPriority {
	CRITICAL = 'critical', // Every frame (60fps)
	HIGH = 'high', // Every other frame (30fps)
	MEDIUM = 'medium', // Every 4th frame (15fps)
	LOW = 'low', // Every 8th frame (7.5fps)
}

export const SystemTiming = trait({
	lastUpdateTime: {} as Record<string, number>,
	updateIntervals: {
		[SystemPriority.CRITICAL]: 0, // Run every frame
		[SystemPriority.HIGH]: 33.33, // ~30fps
		[SystemPriority.MEDIUM]: 66.67, // ~15fps
		[SystemPriority.LOW]: 133.33, // ~7.5fps
	} as Record<string, number>,
});
