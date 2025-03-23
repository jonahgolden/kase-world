import { Entity } from 'koota';
import { useQueryFirst } from 'koota/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { IsBaby, MovementMode, MovementModeType, Ref, Transform } from '../traits';

export function BabyView({ entity }: { entity: Entity }) {
	const meshRef = useRef<THREE.Mesh | null>(null);
	const groupRef = useRef<THREE.Group | null>(null);

	// Track movement mode
	const [currentMode, setCurrentMode] = useState<MovementModeType>('crawl');

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
		(mesh: THREE.Mesh | null) => {
			if (!mesh) return;
			meshRef.current = mesh;

			// Store the mesh reference in the entity
			entity.add(Ref(mesh));

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

	// Set reference to the group for animations
	const setGroupRef = useCallback((group: THREE.Group | null) => {
		if (!group) return;
		groupRef.current = group;
	}, []);

	return (
		<mesh ref={setInitial}>
			{/* Simple placeholder sphere for the baby's head */}
			<sphereGeometry args={[0.2, 16, 16]} />
			<meshStandardMaterial color="#FFB6C1" />

			{/* Baby body - adjusted for crawl/walk modes */}
			<group
				ref={setGroupRef}
				position={[0, currentMode === 'crawl' ? -0.3 : -0.2, 0]}
				rotation={[currentMode === 'crawl' ? 0.3 : 0, 0, 0]}
			>
				{/* Torso */}
				<mesh position={[0, -0.1, 0]}>
					<boxGeometry args={[0.3, 0.3, 0.2]} />
					<meshStandardMaterial color="#FFD700" />
				</mesh>

				{/* Arms - rotate differently based on mode */}
				<mesh
					position={[0.2, -0.1, 0]}
					rotation={[0, 0, currentMode === 'crawl' ? Math.PI / 2 : Math.PI / 4]}
				>
					<capsuleGeometry args={[0.05, 0.2, 4, 8]} />
					<meshStandardMaterial color="#FFB6C1" />
				</mesh>
				<mesh
					position={[-0.2, -0.1, 0]}
					rotation={[0, 0, currentMode === 'crawl' ? Math.PI / 2 : Math.PI / 4]}
				>
					<capsuleGeometry args={[0.05, 0.2, 4, 8]} />
					<meshStandardMaterial color="#FFB6C1" />
				</mesh>

				{/* Legs - different positions based on mode */}
				<mesh position={[0.1, -0.3, 0]} rotation={[currentMode === 'crawl' ? 0 : Math.PI / 6, 0, 0]}>
					<capsuleGeometry args={[0.05, 0.15, 4, 8]} />
					<meshStandardMaterial color="#FFB6C1" />
				</mesh>
				<mesh position={[-0.1, -0.3, 0]} rotation={[currentMode === 'crawl' ? 0 : -Math.PI / 6, 0, 0]}>
					<capsuleGeometry args={[0.05, 0.15, 4, 8]} />
					<meshStandardMaterial color="#FFB6C1" />
				</mesh>
			</group>
		</mesh>
	);
}

// Query for the baby entity and render it
export function BabyRenderer() {
	const baby = useQueryFirst(IsBaby, Transform);
	return baby ? <BabyView entity={baby} /> : null;
}
