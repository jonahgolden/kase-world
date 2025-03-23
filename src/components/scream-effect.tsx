import { useFrame } from '@react-three/fiber';
import { useQueryFirst } from 'koota/react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { calculateRingCount } from '../systems/baby-scream';
import { IsBaby, Scream, Transform } from '../traits';

// Visual constants
const INITIAL_RING_SIZE = 0.05; // 1/3 of the original size (0.2)
const RING_SCALE_FACTOR = 1.15; // Controls how fast the rings grow
const WAVE_FREQUENCY = 4; // Controls how fast the waves oscillate
const WAVE_AMPLITUDE = 0.03; // Controls how much the rings wave

// Ring interface for type safety
interface ScreamRing {
	id: number;
	position: THREE.Vector3;
	rotation: THREE.Euler;
	scale: number;
	life: number;
	offset: number; // Random offset for wave effect
	color: THREE.Color; // Color based on charge amount
}

/**
 * Visual effect for the baby's scream attack
 */
export function ScreamEffect() {
	// Use refs instead of state for position and direction to avoid re-renders
	const babyPositionRef = useRef(new THREE.Vector3());
	const babyDirectionRef = useRef(new THREE.Euler());

	// Track processed scream IDs
	const processedScreamIdsRef = useRef<number[]>([]);

	// Get the baby entity using useQueryFirst
	const babyEntity = useQueryFirst(IsBaby, Transform, Scream);

	// State for managing scream rings
	const [screamRings, setScreamRings] = useState<ScreamRing[]>([]);

	// Use a ref for nextId to avoid re-renders
	const nextIdRef = useRef(0);

	// Function to create a new scream ring
	const createScreamRings = (position: THREE.Vector3, rotation: THREE.Euler, chargeRatio: number) => {
		// Determine how many rings to create based on charge
		const ringCount = calculateRingCount(chargeRatio);

		// Calculate color based on charge (white to blue for increasing charge)
		const ringColor = new THREE.Color().setHSL(0.6 * chargeRatio, 0.8, 0.7);

		// Create multiple rings with slight offset
		const newRings: ScreamRing[] = [];
		for (let i = 0; i < ringCount; i++) {
			// Create rings with slight delay for release
			const randomOffset = Math.random() * Math.PI * 2; // Random phase for wave effect

			newRings.push({
				id: nextIdRef.current++,
				position: position.clone(),
				rotation: rotation.clone(),
				scale: INITIAL_RING_SIZE,
				life: 1.0, // Start with full life
				offset: randomOffset,
				color: ringColor.clone(),
			});
		}

		// Add the new rings to the state
		setScreamRings((prev) => [...prev, ...newRings]);
	};

	// Update position and monitor scream state changes
	useEffect(() => {
		if (!babyEntity) return;

		// Get current transform and update position/rotation refs
		const transform = babyEntity.get(Transform);
		if (transform) {
			babyPositionRef.current.copy(transform.position);
			babyDirectionRef.current.copy(transform.rotation);
		}

		// Setup query-polling to track changes
		const trackChangesInterval = setInterval(() => {
			if (!babyEntity) return;

			// Update position and rotation
			const transform = babyEntity.get(Transform);
			if (transform) {
				babyPositionRef.current.copy(transform.position);
				babyDirectionRef.current.copy(transform.rotation);
			}

			// Check scream state
			const scream = babyEntity.get(Scream);
			if (scream) {
				// Check for new screams that we haven't processed yet
				const newScreams = scream.activeScreams.filter(
					(activeScream) => !processedScreamIdsRef.current.includes(activeScream.id)
				);

				// Process each new scream
				if (newScreams.length > 0) {
					newScreams.forEach((newScream) => {
						// Baby's current position
						const startPos = babyPositionRef.current.clone();
						startPos.y += 0.2; // Position at the level of baby's head

						// Calculate charge ratio
						const chargeRatio = newScream.chargeAmount / scream.maxChargeTime;

						// Create rings based on charge amount
						createScreamRings(startPos, babyDirectionRef.current, chargeRatio);

						// Add scream ID to processed list
						processedScreamIdsRef.current.push(newScream.id);
					});
				}

				// Clean up processed IDs that aren't in the active list anymore
				if (processedScreamIdsRef.current.length > 0) {
					processedScreamIdsRef.current = processedScreamIdsRef.current.filter((id) =>
						scream.activeScreams.some((s) => s.id === id)
					);
				}
			}
		}, 16); // Check at approximately 60 FPS

		return () => clearInterval(trackChangesInterval);
	}, [babyEntity]); // Re-run when the entity reference changes

	// Animate the rings - let them grow and move forward with wave effect
	useFrame((_, delta) => {
		// Update existing rings
		setScreamRings(
			(prev) =>
				prev
					.map((ring) => {
						// Get forward direction
						const forwardDir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, ring.rotation.y, 0));

						// Move ring forward
						const newPos = ring.position.clone().addScaledVector(forwardDir, 10 * delta);

						// Grow the ring
						const newScale = ring.scale + RING_SCALE_FACTOR * delta * 0.5;

						// Decrease life
						const newLife = ring.life - delta * 0.5; // Slowed down life decrease for test ring

						return {
							...ring,
							position: newPos,
							scale: newScale,
							life: newLife,
						};
					})
					.filter((ring) => ring.life > 0) // Remove rings with no life left
		);
	});

	return (
		<group>
			{/* Render all active scream rings */}
			{screamRings.map((ring) => {
				// Calculate wave effect based on time
				const time = performance.now() * 0.001; // Convert to seconds
				const waveOffset = Math.sin(time * WAVE_FREQUENCY + ring.offset) * WAVE_AMPLITUDE;

				return (
					<mesh key={ring.id} position={ring.position} rotation={ring.rotation}>
						<torusGeometry args={[ring.scale, 0.05 + waveOffset, 16, 32]} />
						<meshBasicMaterial
							color={ring.color}
							transparent={true}
							opacity={ring.life}
							side={THREE.DoubleSide}
						/>
					</mesh>
				);
			})}
		</group>
	);
}
