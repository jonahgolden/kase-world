import { createRemoved, World } from 'koota';
import { SpatialHashMap, SpatialTracking, Time, Transform } from '../traits';

const Removed = createRemoved();

// Threshold for considering an entity as moved (squared distance)
const MOVEMENT_THRESHOLD_SQ = 0.0001;

export const updateSpatialHashing = (world: World) => {
	const spatialHashMap = world.get(SpatialHashMap);
	const time = world.get(Time);
	if (!spatialHashMap || !time) return;

	// Add or update entities in the spatial hash map
	world.query(Transform, SpatialTracking).updateEach(([transform, tracking], entity) => {
		// Check if entity has moved enough to warrant an update
		const hasMoved =
			tracking.isDirty || tracking.lastPosition.distanceToSquared(transform.position) > MOVEMENT_THRESHOLD_SQ;

		if (hasMoved) {
			// Update the spatial hash
			spatialHashMap.setEntity(entity, transform.position.x, transform.position.y, transform.position.z);

			// Update tracking info
			tracking.lastPosition.copy(transform.position);
			tracking.lastUpdateTime = time.current;
			tracking.isDirty = false;
		}
	});

	// Remove entities from the spatial hash map
	world.query(Removed(Transform)).forEach((entity) => {
		spatialHashMap.removeEntity(entity);
	});
};
