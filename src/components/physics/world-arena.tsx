import { RigidBody } from '@react-three/rapier';
import * as THREE from 'three';

/**
 * Simple arena world with Rapier physics
 * All static colliders - no ECS entities needed!
 */
export function WorldArena() {
	// Arena dimensions
	const arenaSize = 40;
	const wallHeight = 4;
	const wallThickness = 1;

	return (
		<>
			{/* North Wall */}
			<RigidBody type="fixed" friction={0.7}>
				<mesh position={[0, wallHeight / 2, -arenaSize / 2]} castShadow receiveShadow>
					<boxGeometry args={[arenaSize, wallHeight, wallThickness]} />
					<meshStandardMaterial color="#8B4513" />
				</mesh>
			</RigidBody>

			{/* South Wall */}
			<RigidBody type="fixed" friction={0.7}>
				<mesh position={[0, wallHeight / 2, arenaSize / 2]} castShadow receiveShadow>
					<boxGeometry args={[arenaSize, wallHeight, wallThickness]} />
					<meshStandardMaterial color="#8B4513" />
				</mesh>
			</RigidBody>

			{/* East Wall */}
			<RigidBody type="fixed" friction={0.7}>
				<mesh position={[arenaSize / 2, wallHeight / 2, 0]} castShadow receiveShadow>
					<boxGeometry args={[wallThickness, wallHeight, arenaSize]} />
					<meshStandardMaterial color="#8B4513" />
				</mesh>
			</RigidBody>

			{/* West Wall */}
			<RigidBody type="fixed" friction={0.7}>
				<mesh position={[-arenaSize / 2, wallHeight / 2, 0]} castShadow receiveShadow>
					<boxGeometry args={[wallThickness, wallHeight, arenaSize]} />
					<meshStandardMaterial color="#8B4513" />
				</mesh>
			</RigidBody>

			{/* Center obstacle - good for cover */}
			<RigidBody type="fixed" friction={0.7}>
				<mesh position={[0, 1.5, 0]} castShadow receiveShadow>
					<boxGeometry args={[4, 3, 4]} />
					<meshStandardMaterial color="#A0522D" />
				</mesh>
			</RigidBody>

			{/* Left obstacle */}
			<RigidBody type="fixed" friction={0.7}>
				<mesh position={[-10, 1, -8]} castShadow receiveShadow>
					<boxGeometry args={[3, 2, 3]} />
					<meshStandardMaterial color="#CD853F" />
				</mesh>
			</RigidBody>

			{/* Right obstacle */}
			<RigidBody type="fixed" friction={0.7}>
				<mesh position={[10, 1, 8]} castShadow receiveShadow>
					<boxGeometry args={[3, 2, 3]} />
					<meshStandardMaterial color="#DEB887" />
				</mesh>
			</RigidBody>

			{/* Elevated platform - for vertical gameplay */}
			<RigidBody type="fixed" friction={0.7}>
				<mesh position={[-12, 2, 0]} castShadow receiveShadow>
					<boxGeometry args={[6, 0.5, 6]} />
					<meshStandardMaterial color="#D2691E" />
				</mesh>
			</RigidBody>

			{/* Small step to help get on platform */}
			<RigidBody type="fixed" friction={0.7}>
				<mesh position={[-9, 1, 0]} castShadow receiveShadow>
					<boxGeometry args={[2, 0.5, 6]} />
					<meshStandardMaterial color="#D2691E" />
				</mesh>
			</RigidBody>
		</>
	);
}
