import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Entity } from 'koota';
import { useQueryFirst } from 'koota/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { BABY_SPAWN_POSITION } from '../actions';
import babyRiggedModelUrl from '../assets/baby/baby-with-idle.glb?url'; // baby-walking
import { Input, IsBaby, MovementMode, MovementModeType, Ref, Transform } from '../traits';

// Preload the baby model
useGLTF.preload(babyRiggedModelUrl);

type AnimationMode = 'crawl-idle' | 'crawl' | 'walk-idle' | 'walk';

export function BabyView({ entity }: { entity: Entity }) {
	const groupRef = useRef<THREE.Group | null>(null);
	const { scene, animations } = useGLTF(babyRiggedModelUrl);
	const { actions, mixer } = useAnimations(animations, groupRef);

	// Track movement mode
	const [currentMode, setCurrentMode] = useState<MovementModeType>('crawl');

	// Track idle mode
	const [idleMode, setIdleMode] = useState<boolean>(true);

	// Track animation mode
	const [animationMode, setAnimationMode] = useState<AnimationMode>('crawl-idle');

	// Calculate model center offset once the model is loaded
	useEffect(() => {
		if (!scene) return;

		// Create a bounding box for the model to find its center
		const boundingBox = new THREE.Box3().setFromObject(scene);
		const center = new THREE.Vector3();
		boundingBox.getCenter(center);
	}, [scene]);

	// Update appearance and animation when movement mode changes
	useEffect(() => {
		if (!entity) return;

		const updateInterval = setInterval(() => {
			// Update MovementMode
			if (entity.has(MovementMode)) {
				const mode = entity.get(MovementMode)?.mode;

				if (mode && mode !== currentMode) {
					setCurrentMode(mode);
				}
			}

			// Update idle mode
			if (entity.has(Input)) {
				const input = entity.get(Input);

				const isIdle = input ? input.forward === 0 && input.strafe === 0 : true;
				if (isIdle !== idleMode) {
					setIdleMode(isIdle);
				}
			}
		}, 100); // Check every 100ms

		return () => clearInterval(updateInterval);
	}, [entity, currentMode, idleMode]);

	// Update animation mode based on movement mode and idle mode
	useEffect(() => {
		if (currentMode === 'crawl' && idleMode) {
			setAnimationMode('walk-idle');
		} else if (currentMode === 'crawl' && !idleMode) {
			setAnimationMode('walk');
		} else if (currentMode === 'walk' && idleMode) {
			setAnimationMode('walk-idle');
		} else if (currentMode === 'walk' && !idleMode) {
			setAnimationMode('walk');
		}
	}, [idleMode, currentMode]);

	// Change animation when animationMode changes
	useEffect(() => {
		// For now, the only animations are walk and walk-idle
		const action = actions[animationMode];
		if (!action) return;

		// Make sure any previously running animations are stopped
		Object.values(actions).forEach((action) => action?.stop());

		// Reset and play
		action.reset().fadeIn(0.5).play();

		return () => {
			action.stop();
		};
	}, [actions, animationMode]);

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
					position: BABY_SPAWN_POSITION,
					rotation: new THREE.Euler(0, 0, 0),
					scale: new THREE.Vector3(1, 1, 1),
				});
			}
		},
		[entity]
	);

	// Update animation mixer on each frame
	useFrame((_, delta) => mixer.update(delta));

	return (
		<group ref={setInitial}>
			<group
				position={[0, 0, 0]}
				rotation={[0, Math.PI, 0]} // Rotate 180 degrees around Y axis so model is facing the correct way
				scale={[0.4, 0.4, 0.4]} // Scale the model to appropriate size
			>
				<primitive object={scene} />
			</group>
		</group>
	);
}

// Query for the baby entity and render it
export function BabyRenderer() {
	const baby = useQueryFirst(IsBaby, Transform);
	return baby ? <BabyView entity={baby} /> : null;
}
