import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Entity } from 'koota';
import { useQuery } from 'koota/react';
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
import { DuogringoHealthBar } from './duogringo-health-bar';

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

	// Update animation when state changes
	useEffect(() => {
		if (!entity) return;

		const updateInterval = setInterval(() => {
			const animState = entity.get(DuogringoAnimation);
			if (!animState) return;

			if (animState.state !== currentAnimationState) {
				setCurrentAnimationState(animState.state);
			}
		}, 100);

		return () => clearInterval(updateInterval);
	}, [entity, currentAnimationState]);

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

	// Update animation mixer on each frame
	useFrame((_, delta) => mixer.update(delta));

	// Update scale based on power
	useEffect(() => {
		if (!entity) return;

		const updateInterval = setInterval(() => {
			const power = entity.get(DuogringoPower);
			if (!power || !groupRef.current) return;

			const scale = power.baseSize * (1 + power.power * 0.5); // Scale increases with power
			setCurrentScale(scale);
			// groupRef.current.scale.setScalar(scale);
		}, 100);

		return () => clearInterval(updateInterval);
	}, [entity]);

	return (
		<group ref={setInitial}>
			<group
				position={[0, 0, 0]}
				rotation={[0, 0, 0]} // Face forward
				scale={[currentScale, currentScale, currentScale]}
			>
				<primitive object={scene} />
			</group>
			{/* Health bar above Duogringo head */}
			<DuogringoHealthBar entity={entity} />
		</group>
	);
}

// Query for all Duogringo entities and render them
export function DuogringoRenderer() {
	const duogringos = useQuery(IsDuogringo, Transform);

	return (
		<>
			{duogringos.map((entity) => (
				<DuogringoView key={entity.id()} entity={entity} />
			))}
		</>
	);
}
