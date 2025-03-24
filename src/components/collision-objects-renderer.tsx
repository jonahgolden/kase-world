import { useThree } from '@react-three/fiber';
import { Entity } from 'koota';
import { useQuery } from 'koota/react';
import { useEffect, useRef } from 'react';
import { Collider, Ref } from '../traits';

export function CollisionObjectsRenderer() {
	const { scene } = useThree();
	const addedRefs = useRef<Set<Entity>>(new Set());

	// Query for all entities with both Collider and Ref traits
	const colliderEntities = useQuery(Collider, Ref);

	useEffect(() => {
		const currentRefs = addedRefs.current;
		// Process all entities with Collider and Ref traits
		colliderEntities.forEach((entity) => {
			// Skip entities we've already processed
			if (currentRefs.has(entity)) return;

			// Get the Object3D from the Ref trait
			const obj = entity.get(Ref);
			if (obj && !scene.getObjectById(obj.id)) {
				// Add the object to the scene if it's not already there
				scene.add(obj);
				currentRefs.add(entity);
			}
		});

		// Cleanup function to remove objects when component unmounts
		return () => {
			currentRefs.forEach((entity) => {
				const obj = entity.get(Ref);
				if (obj && scene.getObjectById(obj.id)) {
					scene.remove(obj);
				}
			});
			currentRefs.clear();
		};
	}, [colliderEntities, scene]);

	return null;
}
