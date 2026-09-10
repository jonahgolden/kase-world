import { RigidBody, CylinderCollider } from '@react-three/rapier';
import * as THREE from 'three';

/**
 * Natural environment with trees, rocks, hills, and lakes
 * All using Rapier physics for proper collisions
 */
export function WorldEnvironment() {
	// Terrain colors from old system
	const COLORS = {
		GRASS_LIGHT: '#8BC34A',
		GRASS_DARK: '#4a8505',
		SAND: '#F4A460',
		ROCK: '#808080',
		TREE_TRUNK: '#4a2f1c',
		TREE_LEAVES: '#2d5a27',
		WATER: '#006994',
	};

	// Helper to create a hill/mound
	const Hill = ({ position, size }: { position: [number, number, number]; size: [number, number, number] }) => (
		<RigidBody type="fixed" friction={0.7}>
			<mesh position={position} castShadow receiveShadow>
				<sphereGeometry args={size} />
				<meshStandardMaterial color={COLORS.GRASS_DARK} />
			</mesh>
		</RigidBody>
	);

	// Helper to create a tree (cylinder trunk + cone foliage)
	const Tree = ({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) => {
		const trunkHeight = 4 * scale;
		const trunkRadius = 0.25 * scale;
		const foliageRadius = 1.5 * scale;

		return (
			<>
				{/* Trunk with collider */}
				<RigidBody type="fixed" friction={0.7}>
					<CylinderCollider args={[trunkHeight / 2, trunkRadius]} />
					<mesh position={[position[0], position[1] + trunkHeight / 2, position[2]]} castShadow receiveShadow>
						<cylinderGeometry args={[trunkRadius, trunkRadius * 1.2, trunkHeight, 8]} />
						<meshStandardMaterial color={COLORS.TREE_TRUNK} />
					</mesh>
				</RigidBody>

				{/* Foliage (visual only - no collider needed) */}
				<mesh position={[position[0], position[1] + trunkHeight + 1, position[2]]} castShadow receiveShadow>
					<coneGeometry args={[foliageRadius, foliageRadius * 1.5, 8]} />
					<meshStandardMaterial color={COLORS.TREE_LEAVES} />
				</mesh>
			</>
		);
	};

	// Helper to create a rock
	const Rock = ({ position, size = 1 }: { position: [number, number, number]; size?: number }) => (
		<RigidBody type="fixed" friction={0.9}>
			<mesh
				position={position}
				rotation={[Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.3]}
				castShadow
				receiveShadow
			>
				<dodecahedronGeometry args={[size * 0.8, 0]} />
				<meshStandardMaterial color={COLORS.ROCK} flatShading />
			</mesh>
		</RigidBody>
	);

	// Helper to create a lake (visual + shallow collider)
	const Lake = ({ position, radius }: { position: [number, number, number]; radius: number }) => (
		<>
			{/* Water surface (visual) */}
			<mesh position={position} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
				<circleGeometry args={[radius, 32]} />
				<meshStandardMaterial
					color={COLORS.WATER}
					transparent
					opacity={0.7}
					roughness={0.1}
					metalness={0.3}
				/>
			</mesh>

			{/* Sandy shore ring */}
			<mesh position={[position[0], position[1] - 0.05, position[2]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
				<ringGeometry args={[radius, radius + 2, 32]} />
				<meshStandardMaterial color={COLORS.SAND} />
			</mesh>
		</>
	);

	return (
		<>
			{/* Hills/Terrain Features */}
			<Hill position={[15, -2, -15]} size={[8, 8, 8]} />
			<Hill position={[-20, -3, 10]} size={[10, 10, 10]} />
			<Hill position={[25, -2.5, 20]} size={[7, 7, 7]} />
			<Hill position={[-15, -1.5, -25]} size={[6, 6, 6]} />

			{/* Forest - North area */}
			<Tree position={[-10, 0, -30]} scale={1.2} />
			<Tree position={[-5, 0, -32]} scale={1.0} />
			<Tree position={[-12, 0, -35]} scale={0.9} />
			<Tree position={[-2, 0, -28]} scale={1.1} />
			<Tree position={[-8, 0, -38]} scale={1.0} />

			{/* Forest - East area */}
			<Tree position={[30, 0, 5]} scale={1.1} />
			<Tree position={[32, 0, 8]} scale={0.95} />
			<Tree position={[28, 0, 12]} scale={1.0} />
			<Tree position={[35, 0, 10]} scale={1.15} />

			{/* Forest - West area */}
			<Tree position={[-30, 0, -5]} scale={1.0} />
			<Tree position={[-32, 0, 0]} scale={1.2} />
			<Tree position={[-28, 0, 5]} scale={0.9} />
			<Tree position={[-35, 0, 2]} scale={1.1} />

			{/* Scattered Trees */}
			<Tree position={[10, 0, 15]} scale={1.0} />
			<Tree position={[-15, 0, 20]} scale={1.1} />
			<Tree position={[5, 0, -10]} scale={0.95} />

			{/* Rock clusters - scattered around */}
			<Rock position={[12, 0.8, -8]} size={1.2} />
			<Rock position={[13, 0.6, -6]} size={0.9} />
			<Rock position={[10, 0.7, -7]} size={1.0} />

			<Rock position={[-18, 0.9, -12]} size={1.3} />
			<Rock position={[-20, 0.7, -10]} size={1.0} />

			<Rock position={[20, 0.8, 18]} size={1.1} />
			<Rock position={[22, 0.6, 20]} size={0.8} />
			<Rock position={[18, 0.9, 19]} size={1.2} />

			<Rock position={[-25, 0.8, 15]} size={1.0} />
			<Rock position={[-23, 0.7, 17]} size={0.9} />

			{/* Individual rocks */}
			<Rock position={[8, 0.6, 8]} size={0.8} />
			<Rock position={[-8, 0.7, -15]} size={1.0} />
			<Rock position={[15, 0.8, 25]} size={1.1} />
			<Rock position={[-12, 0.6, 28]} size={0.9} />
			<Rock position={[0, 0.7, 20]} size={1.0} />

			{/* Lakes */}
			<Lake position={[-25, 0.01, -20]} radius={6} />
			<Lake position={[20, 0.01, -15]} radius={5} />
		</>
	);
}
