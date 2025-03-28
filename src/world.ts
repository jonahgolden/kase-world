import { createWorld } from 'koota';
import { SpatialHashMap, SpatialTracking, SystemTiming, Time } from './traits';

export const world = createWorld(Time, SpatialHashMap, SpatialTracking, SystemTiming);
