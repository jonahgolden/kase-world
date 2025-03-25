import { Canvas } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { Color } from 'three';
import { CameraRenderer } from './components/camera-renderer';
import { CollisionDebugRenderer } from './components/collision-debug-renderer';
import { CollisionObjectsRenderer } from './components/collision-objects-renderer';
import { DamageEffect } from './components/damage-effect';
import { GameOverScreen } from './components/game-over-screen';
import { HealthUI } from './components/health-ui';
import { MovementModeUI } from './components/movement-mode-ui';
import { PlayerRenderer } from './components/player-renderer';
import { ScreamEffect } from './components/scream-effect';
import { ScreamUI } from './components/scream-ui';
import { GameLoop } from './frameloop';
import { Startup } from './startup';
import { setGameOverCallback } from './systems/health-system';

export function App() {
	const [isGameOver, setIsGameOver] = useState(false);

	// Set up game over callback
	useEffect(() => {
		// Configure game over callback
		setGameOverCallback(() => {
			setIsGameOver(true);
		});
	}, []);

	// Handle restart game
	const handleRestart = () => {
		setIsGameOver(false);
		// Respawn baby with full health - this will be handled by the Startup component
		window.location.reload(); // Simple reload for now, could be improved with a more sophisticated reset
	};

	return (
		<>
			<Canvas style={{ background: 'white' }} shadows={false} gl={{ alpha: false }}>
				<color attach="background" args={[new Color('#f0f0f0')]} />
				<Startup initialCameraPosition={[0, 1.5, 4]} />
				<GameLoop />

				<CameraRenderer />
				<PlayerRenderer />
				<ScreamEffect />
				<CollisionObjectsRenderer />
				<CollisionDebugRenderer enabled={true} />

				{/* Simple floor */}
				<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
					<planeGeometry args={[50, 50]} />
					<meshStandardMaterial color="#8BC34A" />
				</mesh>

				<ambientLight intensity={1.02} />
				<directionalLight position={[10.41789, -5.97702, 10]} intensity={1.5} color={'#ffffff'} />
				<directionalLight position={[10.55754, 5.89323, 9.99894]} intensity={2.0} color={'#ffffff'} />
			</Canvas>

			{/* UI components outside Canvas */}
			<MovementModeUI />
			<HealthUI />
			<ScreamUI />
			<DamageEffect />
			<GameOverScreen isVisible={isGameOver} onRestart={handleRestart} />
		</>
	);
}
