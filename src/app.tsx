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
			<Canvas style={{ background: 'white' }} shadows={true} gl={{ alpha: false }}>
				<color attach="background" args={[new Color('#87CEEB')]} />
				<Startup initialCameraPosition={[0, 1.5, 4]} />
				<GameLoop />

				<CameraRenderer />
				<PlayerRenderer />
				<ScreamEffect />
				<CollisionObjectsRenderer />
				<CollisionDebugRenderer enabled={true} />

				<ambientLight intensity={0.5} color="#ffffff" />
				<directionalLight
					position={[50, 50, 25]}
					intensity={1.0}
					castShadow
					shadow-mapSize-width={2048}
					shadow-mapSize-height={2048}
					shadow-camera-far={100}
					shadow-camera-left={-50}
					shadow-camera-right={50}
					shadow-camera-top={50}
					shadow-camera-bottom={-50}
				/>
				<hemisphereLight intensity={0.3} color="#ffffff" groundColor="#8d7b68" />
				<fog attach="fog" args={['#87CEEB', 50, 200]} />
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
