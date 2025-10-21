import { createWorld } from 'koota';
import { SystemTiming, Time } from './traits';

export const world = createWorld(Time, SystemTiming);
