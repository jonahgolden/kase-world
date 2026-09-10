import { RigidBody } from '@react-three/rapier';

/**
 * Simple ground plane with Rapier physics
 */
export function PhysicsGround() {
	return (
		<RigidBody type="fixed" friction={0.7}>
			<mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
				<planeGeometry args={[1000, 1000]} />
				<meshStandardMaterial color="#90EE90" />
			</mesh>
		</RigidBody>
	);
}
