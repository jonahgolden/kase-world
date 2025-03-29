import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

export function Clouds() {
	const cloudsRef = useRef<THREE.Group>(null);

	// Generate random cloud positions with more variation
	const cloudCount = 25;
	const clouds = Array.from({ length: cloudCount }, () => {
		// More dramatic size variation
		const cloudType = Math.random(); // Used to determine cloud size category
		let baseScale;

		if (cloudType < 0.2) {
			// 20% chance of being a large cloud
			baseScale = 3 + Math.random() * 2; // Large clouds (3-5x base size)
		} else if (cloudType < 0.7) {
			// 50% chance of being medium
			baseScale = 1.5 + Math.random() * 1.5; // Medium clouds (1.5-3x base size)
		} else {
			// 30% chance of being small
			baseScale = 0.5 + Math.random() * 1; // Small clouds (0.5-1.5x base size)
		}

		return {
			position: new THREE.Vector3(
				(Math.random() - 0.5) * 200,
				// Higher altitude for bigger clouds
				20 + Math.random() * 30 + baseScale * 5,
				(Math.random() - 0.5) * 200
			),
			rotation: new THREE.Euler(
				(Math.random() - 0.5) * 0.2,
				Math.random() * Math.PI * 2,
				(Math.random() - 0.5) * 0.2
			),
			scale: new THREE.Vector3(
				baseScale * (1.5 + Math.random()), // Extra elongated on X
				baseScale * (0.6 + Math.random() * 0.3), // Flatter on Y
				baseScale * (1 + Math.random()) // Varied on Z
			),
			speed: 0.1 + Math.random() * 0.4,
			rotationSpeed: (Math.random() - 0.5) * 0.1,
			bobSpeed: 0.3 + Math.random() * 0.4, // Slower bobbing for larger clouds
			bobHeight: 0.1 + Math.random() * 0.2, // Reduced bob height for stability
			bobOffset: Math.random() * Math.PI * 2,
		};
	});

	// Animate clouds with more complex movement
	useFrame((_, delta) => {
		clouds.forEach((cloud, i) => {
			const group = cloudsRef.current?.children[i] as THREE.Group;
			if (group) {
				// Apply movement to the whole group
				group.position.x += cloud.speed * delta;
				group.position.y +=
					Math.sin(performance.now() * 0.001 * cloud.bobSpeed + cloud.bobOffset) * cloud.bobHeight * delta;
				group.rotation.y += cloud.rotationSpeed * delta;

				// Reset cloud position when it goes too far
				if (group.position.x > 100) {
					group.position.x = -100;
					group.position.z = (Math.random() - 0.5) * 200;
					group.position.y = 20 + Math.random() * 30 + cloud.scale.x * 2;
				}
			}
		});
	});

	return (
		<group ref={cloudsRef}>
			{clouds.map((cloud, i) => (
				<group key={i} position={cloud.position} rotation={cloud.rotation}>
					{/* Main cloud body */}
					<mesh scale={cloud.scale}>
						<dodecahedronGeometry args={[2]} />
						<meshStandardMaterial color="#ffffff" transparent opacity={0.8} roughness={1} metalness={0} />
					</mesh>

					{/* Additional cloud details - multiple smaller parts */}
					{Array.from({ length: 3 }, (_, index) => (
						<mesh
							key={index}
							position={[(Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4]}
							rotation={[
								cloud.rotation.x + (Math.random() - 0.5) * 0.2,
								cloud.rotation.y + (Math.random() - 0.5) * 0.2,
								cloud.rotation.z + (Math.random() - 0.5) * 0.2,
							]}
							scale={[
								cloud.scale.x * (0.4 + Math.random() * 0.3),
								cloud.scale.y * (0.4 + Math.random() * 0.3),
								cloud.scale.z * (0.4 + Math.random() * 0.3),
							]}
						>
							<dodecahedronGeometry args={[1.5]} />
							<meshStandardMaterial color="#ffffff" transparent opacity={0.6} roughness={1} metalness={0} />
						</mesh>
					))}
				</group>
			))}
		</group>
	);
}
