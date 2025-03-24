import { trait } from 'koota';

/**
 * Tag trait for identifying vehicle entities
 */
export const IsVehicle = trait();

/**
 * Trait for tracking vehicle properties
 */
export const Vehicle = trait({
	type: 'car' as 'car' | 'tricycle' | 'wagon',
	maxSpeed: 10.0,
	acceleration: 2.0,
	isOccupied: false,
	driver: null as number | null, // Entity ID of the driver, if any
});
