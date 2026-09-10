import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { useEffect, useState } from 'react';
import { CameraRenderer } from './components/camera-renderer';
import { CollisionDebugRenderer } from './components/collision-debug-renderer';
import { CollisionObjectsRenderer } from './components/collision-objects-renderer';
import { DamageEffect } from './components/damage-effect';
import { DuogringoRenderer } from './components/duogringo-renderer';
import { GameOverScreen } from './components/game-over-screen';
import { HealthUI } from './components/health-ui';
import { MovementModeUI } from './components/movement-mode-ui';
import { PlayerRenderer } from './components/player-renderer';
import { SceneRenderer } from './components/scene-renderer';
import { ScreamEffect } from './components/scream-effect';
import { ScreamUI } from './components/scream-ui';
import { GameLoop } from './frameloop';
import { Startup } from './startup';
import { setGameOverCallback } from './systems/health-system';
import { PhysicsGround } from './components/physics/ground';
import { PlayerPhysics } from './components/physics/player-physics';
import { DuogringoPhysics } from './components/physics/duogringo-physics';
// import { WorldArena } from './components/physics/world-arena'; // Simple arena - disabled in favor of natural world
import { WorldEnvironment } from './components/physics/world-environment';

export function App() {
	const [isGameOver, setIsGameOver] = useState(false);

	// Set up game over callback
	useEffect(() => {
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
				<Physics gravity={[0, -9.8, 0]} debug={true}>
					<SceneRenderer />
					<Startup initialCameraPosition={[0, 2.4, 5]} />
					<GameLoop />

					{/* Rapier Physics Bodies */}
					<PhysicsGround />
					<WorldEnvironment />
					<PlayerPhysics />
					<DuogringoPhysics />

					<CameraRenderer />
					<PlayerRenderer />
					<DuogringoRenderer />
					<ScreamEffect />
					<CollisionObjectsRenderer />
					<CollisionDebugRenderer />
				</Physics>
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
