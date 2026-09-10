import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Entity } from 'koota';
import { useQueryFirst } from 'koota/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import duogringoModelUrl from '../assets/duogringo.glb?url';
import {
	DUOGRINGO_BASE_SCALE,
	DuogringoAnimation,
	DuogringoAnimationState,
	DuogringoPower,
	IsDuogringo,
	Ref,
	Transform,
} from '../traits';

// Preload the model
useGLTF.preload(duogringoModelUrl);

export function DuogringoView({ entity }: { entity: Entity }) {
	const groupRef = useRef<THREE.Group | null>(null);
	const { scene, animations } = useGLTF(duogringoModelUrl);
	const { actions, mixer } = useAnimations(animations, groupRef);

	// Track current animation state
	const [currentAnimationState, setCurrentAnimationState] = useState<DuogringoAnimationState>('Idle');

	// Track current scale
	const [currentScale, setCurrentScale] = useState<number>(DUOGRINGO_BASE_SCALE);

	// Set up initial state with useCallback
	const setInitial = useCallback(
		(group: THREE.Group | null) => {
			if (!group) return;
			groupRef.current = group;

			// Store the model reference in the entity
			entity.add(Ref(group));
		},
		[entity]
	);


	// Change animation when currentAnimationState changes
	useEffect(() => {
		const action = actions[currentAnimationState];
		if (!action) return;

		// Stop all other animations
		Object.values(actions).forEach((a) => a?.stop());

		// Play the new animation
		action.reset().fadeIn(0.5).play();

		return () => {
			action.stop();
		};
	}, [actions, currentAnimationState]);

	// Update animation mixer, animation state, and scale on each frame
	useFrame((_, delta) => {
		if (!entity) return;

		// Update animation mixer
		mixer.update(delta);

		// Check for animation state changes
		const animState = entity.get(DuogringoAnimation);
		if (animState && animState.state !== currentAnimationState) {
			setCurrentAnimationState(animState.state);
		}

		// Update scale based on power
		const power = entity.get(DuogringoPower);
		if (power) {
			const scale = power.baseSize * (1 + power.power * 0.5); // Scale increases with power
			if (scale !== currentScale) {
				setCurrentScale(scale);
			}
		}
	});

	return (
		<group ref={setInitial}>
			<group
				position={[0, 0, 0]}
				rotation={[0, 0, 0]} // Face forward
				scale={[currentScale, currentScale, currentScale]}
			>
				<primitive object={scene} />
			</group>
		</group>
	);
}

// Query for Duogringo entity and render it
export function DuogringoRenderer() {
	const duogringo = useQueryFirst(IsDuogringo, Transform);
	return duogringo ? <DuogringoView entity={duogringo} /> : null;
}
