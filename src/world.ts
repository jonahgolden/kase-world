import { createWorld } from 'koota';
import { SpatialHashMap, SpatialTracking, Time } from './traits';

export const world = createWorld(Time, SpatialHashMap, SpatialTracking);
