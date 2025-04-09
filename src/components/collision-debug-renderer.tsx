import { useFrame, useThree } from '@react-three/fiber';
import { useQuery, useWorld } from 'koota/react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Collider, ColliderType, Transform } from '../traits';

// Helper type to track entity-wireframe associations
type EntityWireframe = {
	entityId: number;
	wireframe: THREE.Object3D;
	colliderType: ColliderType;
};

export function CollisionDebugRenderer({ enabled = false }: { enabled?: boolean }) {
	const [showDebug, setShowDebug] = useState(enabled);
	const world = useWorld();
	const { scene } = useThree();

	// Track both the wireframe objects and their associated entities
	const debugObjects = useRef<EntityWireframe[]>([]);

	// Toggle debug rendering with the 'D' key
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'x' || e.key === 'X') {
				setShowDebug((prev) => !prev);
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

	// Query for all entities with Collider trait
	const colliderEntities = useQuery(Collider, Transform);

	// Create or remove wireframes when entities or show/hide state changes
	useEffect(() => {
		if (!showDebug) {
			// Remove all debug objects when not showing
			debugObjects.current.forEach(({ wireframe }) => scene.remove(wireframe));
			debugObjects.current = [];
			return;
		}

		// Track which entities we've processed
		const processedEntities = new Set<number>();
		const entitiesToKeep = new Set<number>();

		// Process each entity with a collider
		colliderEntities.forEach((entity) => {
			const entityId = entity.id();
			const collider = entity.get(Collider);
			const transform = entity.get(Transform);

			if (!collider || !transform) return;

			entitiesToKeep.add(entityId);
			processedEntities.add(entityId);

			// Check if we already have a wireframe for this entity
			const existingIndex = debugObjects.current.findIndex((obj) => obj.entityId === entityId);

			// If the entity already has a wireframe and the collider type hasn't changed, we can keep it
			if (existingIndex >= 0 && debugObjects.current[existingIndex].colliderType === collider.type) {
				// We'll update positions in the useFrame hook
				return;
			}

			// If we're here, we need to create a new wireframe or the collider type has changed
			let wireframe: THREE.Object3D | null = null;

			// Create wireframe based on collider type
			if (collider.type === ColliderType.SPHERE) {
				const geometry = new THREE.SphereGeometry(collider.radius, 16, 12);
				const wireframeGeometry = new THREE.WireframeGeometry(geometry);
				wireframe = new THREE.LineSegments(
					wireframeGeometry,
					new THREE.LineBasicMaterial({
						color: collider.isTrigger ? 0x00ffff : 0xff0000,
						transparent: true,
						opacity: 0.5,
					})
				);
			} else if (collider.type === ColliderType.BOX) {
				const geometry = new THREE.BoxGeometry(collider.size.x, collider.size.y, collider.size.z);
				const wireframeGeometry = new THREE.WireframeGeometry(geometry);
				wireframe = new THREE.LineSegments(
					wireframeGeometry,
					new THREE.LineBasicMaterial({
						color: collider.isTrigger ? 0x00ffff : 0xff0000,
						transparent: true,
						opacity: 0.5,
					})
				);
			} else if (collider.type === ColliderType.CAPSULE) {
				const geometry = new THREE.CapsuleGeometry(collider.radius, collider.height, 8, 16);
				const wireframeGeometry = new THREE.WireframeGeometry(geometry);
				wireframe = new THREE.LineSegments(
					wireframeGeometry,
					new THREE.LineBasicMaterial({
						color: collider.isTrigger ? 0x00ffff : 0xff0000,
						transparent: true,
						opacity: 0.5,
					})
				);
			} else if (collider.type === ColliderType.DODECAHEDRON) {
				// Use the radius from the collider
				const geometry = new THREE.DodecahedronGeometry(collider.radius);
				const wireframeGeometry = new THREE.WireframeGeometry(geometry);
				wireframe = new THREE.LineSegments(
					wireframeGeometry,
					new THREE.LineBasicMaterial({
						color: collider.isTrigger ? 0x00ffff : 0xff0000,
						transparent: true,
						opacity: 0.5,
					})
				);
			}

			if (wireframe) {
				// If we had an existing wireframe, remove it
				if (existingIndex >= 0) {
					scene.remove(debugObjects.current[existingIndex].wireframe);
					debugObjects.current.splice(existingIndex, 1);
				}

				// Add the new wireframe to the scene
				scene.add(wireframe);
				debugObjects.current.push({
					entityId,
					wireframe,
					colliderType: collider.type,
				});
			}
		});

		// Remove wireframes for entities that no longer exist or have lost their collider
		debugObjects.current = debugObjects.current.filter((obj) => {
			if (!entitiesToKeep.has(obj.entityId)) {
				scene.remove(obj.wireframe);
				return false;
			}
			return true;
		});

		return () => {
			// Clean up on unmount or when parameters change
			debugObjects.current.forEach(({ wireframe }) => scene.remove(wireframe));
			debugObjects.current = [];
		};
	}, [colliderEntities, scene, showDebug, world]);

	// Update wireframe positions every frame
	useFrame(() => {
		if (!showDebug) return;

		debugObjects.current.forEach(({ entityId, wireframe }) => {
			const entity = world.query(Transform, Collider).find((e) => e.id() === entityId);
			if (!entity) return;

			const transform = entity.get(Transform);
			const collider = entity.get(Collider);

			if (!transform || !collider) return;

			// Update wireframe position to match entity's transform + collider offset
			const worldPosition = new THREE.Vector3().copy(transform.position).add(collider.offset);
			wireframe.position.copy(worldPosition);
			wireframe.rotation.copy(transform.rotation);
			wireframe.scale.copy(transform.scale);
		});
	});

	// Add instructions text
	useEffect(() => {
		// Create a text element to display instructions
		const instructionsDiv = document.createElement('div');
		instructionsDiv.style.position = 'absolute';
		instructionsDiv.style.bottom = '10px';
		instructionsDiv.style.right = '10px';
		instructionsDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
		instructionsDiv.style.color = 'white';
		instructionsDiv.style.padding = '5px 10px';
		instructionsDiv.style.fontFamily = 'monospace';
		instructionsDiv.style.fontSize = '12px';
		instructionsDiv.style.borderRadius = '4px';
		instructionsDiv.innerHTML = 'Press X to toggle collision wireframes';

		if (typeof document !== 'undefined') {
			document.body.appendChild(instructionsDiv);

			return () => {
				document.body.removeChild(instructionsDiv);
			};
		}
	}, []);

	return null;
}
