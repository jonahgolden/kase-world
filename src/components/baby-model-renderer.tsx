import { useGLTF } from '@react-three/drei';
import { Entity } from 'koota';
import { useQueryFirst } from 'koota/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import babyModelUrl from '../assets/baby/baby1.glb?url';
import { IsBaby, MovementMode, MovementModeType, Ref, Transform } from '../traits';

// Preload the baby model
useGLTF.preload(babyModelUrl);

// Position adjustments to fine-tune model placement
const POSITION_ADJUSTMENT = {
	x: 0, // Left/right adjustment
	y: 0.2, // Up/down adjustment
	z: 0, // Forward/backward adjustment
};

export function BabyModelView({ entity }: { entity: Entity }) {
	const { scene } = useGLTF(babyModelUrl);
	const groupRef = useRef<THREE.Group | null>(null);
	const [modelOffset, setModelOffset] = useState({ x: 0, y: 0, z: 0 });

	// Track movement mode
	const [currentMode, setCurrentMode] = useState<MovementModeType>('crawl');

	// Calculate model center offset once the model is loaded
	useEffect(() => {
		if (!scene) return;

		// Create a bounding box for the model to find its center
		const boundingBox = new THREE.Box3().setFromObject(scene);
		const center = new THREE.Vector3();
		boundingBox.getCenter(center);

		// Set the offset to center the model (negative center values)
		setModelOffset({
			x: -center.x + POSITION_ADJUSTMENT.x,
			y: -center.y + POSITION_ADJUSTMENT.y,
			z: -center.z + POSITION_ADJUSTMENT.z,
		});
	}, [scene]);

	// Update appearance when movement mode changes
	useEffect(() => {
		if (!entity) return;

		const updateInterval = setInterval(() => {
			if (entity.has(MovementMode)) {
				const mode = entity.get(MovementMode)?.mode;
				if (mode && mode !== currentMode) {
					setCurrentMode(mode);
				}
			}
		}, 100); // Check every 100ms

		return () => clearInterval(updateInterval);
	}, [entity, currentMode]);

	// Set up initial state with useCallback
	const setInitial = useCallback(
		(group: THREE.Group | null) => {
			if (!group) return;
			groupRef.current = group;

			// Store the model reference in the entity
			entity.add(Ref(group));

			// Initialize transform if needed
			if (!entity.has(Transform)) {
				entity.set(Transform, {
					position: new THREE.Vector3(0, 0.5, 0), // Match the GROUND_LEVEL
					rotation: new THREE.Euler(0, 0, 0),
					scale: new THREE.Vector3(1, 1, 1),
				});
			}
		},
		[entity]
	);

	// Adjust the model based on movement mode
	// Add Y rotation of 180 degrees (Math.PI) to make the baby face away from the camera
	const crawlRotation = new THREE.Euler(Math.PI / 8, Math.PI, 0); // Slight forward tilt for crawling + 180 degrees Y rotation
	const walkRotation = new THREE.Euler(0, Math.PI, 0); // Upright for walking + 180 degrees Y rotation

	return (
		<group ref={setInitial}>
			<group
				// Position offset with calculated center adjustment and mode-specific y-position
				position={[
					modelOffset.x,
					currentMode === 'crawl' ? -0.1 + modelOffset.y : modelOffset.y,
					modelOffset.z,
				]}
				rotation={currentMode === 'crawl' ? crawlRotation : walkRotation}
				scale={[0.4, 0.4, 0.4]} // Scale the model to appropriate size
			>
				<primitive object={scene.clone()} />
			</group>
		</group>
	);
}

// Query for the baby entity and render it
export function BabyModelRenderer() {
	const baby = useQueryFirst(IsBaby, Transform);
	return baby ? <BabyModelView entity={baby} /> : null;
}
