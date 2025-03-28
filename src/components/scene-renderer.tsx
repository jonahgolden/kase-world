import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { AmbientLight, Color, DirectionalLight, Fog, HemisphereLight } from 'three';

export type VisualMode = 'day' | 'night';

type LightingConfig = {
	[key in VisualMode]: {
		ambientIntensity: number;
		directionalIntensity: number;
		hemisphereIntensity: number;
		skyColor: string;
		fogColor: string;
		fogNear: number;
		fogFar: number;
	};
};

const LIGHTING_CONFIG: LightingConfig = {
	day: {
		ambientIntensity: 0.5,
		directionalIntensity: 1.0,
		hemisphereIntensity: 0.3,
		skyColor: '#87CEEB', // Sky blue
		fogColor: '#87CEEB',
		fogNear: 50,
		fogFar: 200,
	},
	night: {
		ambientIntensity: 0.2,
		directionalIntensity: 0.3,
		hemisphereIntensity: 0.1,
		skyColor: '#0C1445', // Dark blue
		fogColor: '#0C1445',
		fogNear: 30,
		fogFar: 150,
	},
};

// Helper functions for interpolation
const lerp = (start: number, end: number, t: number) => start + (end - start) * t;
const lerpColor = (start: string, end: string, t: number) => {
	const startColor = new Color(start);
	const endColor = new Color(end);
	return new Color().lerpColors(startColor, endColor, t);
};

export function SceneRenderer() {
	const [mode, setMode] = useState<VisualMode>('day');
	const [targetMode, setTargetMode] = useState<VisualMode>('day');
	const [progress, setProgress] = useState(0);
	const [isTransitioning, setIsTransitioning] = useState(false);

	// Refs for all the lights and visual elements
	const ambientLightRef = useRef<AmbientLight>(null);
	const directionalLightRef = useRef<DirectionalLight>(null);
	const hemisphereLightRef = useRef<HemisphereLight>(null);
	const backgroundRef = useRef<Color>(null);
	const fogRef = useRef<Fog>(null);

	// Toggle Day/Night mode with 'N' key
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'n' || e.key === 'N') {
				setIsTransitioning((prev) => {
					if (prev === true) return true;

					setTargetMode((prev) => (prev === 'day' ? 'night' : 'day'));
					setProgress(0); // Reset progress for new transition
					return !prev;
				});
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

	// Update lighting values each frame
	useFrame((_, delta) => {
		// Handle transition
		if (isTransitioning) {
			setProgress((prev) => Math.min(1, prev + delta / 2)); // 2-second transition

			const startConfig = LIGHTING_CONFIG[mode];
			const endConfig = LIGHTING_CONFIG[targetMode];

			// Update ambient light
			if (ambientLightRef.current) {
				ambientLightRef.current.intensity = lerp(
					startConfig.ambientIntensity,
					endConfig.ambientIntensity,
					progress
				);
			}

			// Update directional light
			if (directionalLightRef.current) {
				directionalLightRef.current.intensity = lerp(
					startConfig.directionalIntensity,
					endConfig.directionalIntensity,
					progress
				);
			}

			// Update hemisphere light
			if (hemisphereLightRef.current) {
				hemisphereLightRef.current.intensity = lerp(
					startConfig.hemisphereIntensity,
					endConfig.hemisphereIntensity,
					progress
				);
			}

			// Update background color
			if (backgroundRef.current) {
				backgroundRef.current.copy(lerpColor(startConfig.skyColor, endConfig.skyColor, progress));
			}

			// Update fog
			if (fogRef.current) {
				fogRef.current.color.copy(lerpColor(startConfig.fogColor, endConfig.fogColor, progress));
				fogRef.current.near = lerp(startConfig.fogNear, endConfig.fogNear, progress);
				fogRef.current.far = lerp(startConfig.fogFar, endConfig.fogFar, progress);
			}

			// Check if transition is complete
			if (progress >= 1) {
				setIsTransitioning(false);
				setMode(targetMode);
			}
		}
	});

	// Initial setup - this only runs once
	const config = LIGHTING_CONFIG[mode];

	return (
		<>
			<color ref={backgroundRef} attach="background" />
			{/* <Startup initialCameraPosition={[0, 1.5, 4]} />
			<GameLoop />

			<CameraRenderer />
			<PlayerRenderer />
			<ScreamEffect />
			<CollisionObjectsRenderer />
			<CollisionDebugRenderer enabled={true} /> */}

			<ambientLight ref={ambientLightRef} intensity={config.ambientIntensity} color="#ffffff" />
			<directionalLight
				ref={directionalLightRef}
				position={[50, 50, 25]}
				intensity={config.directionalIntensity}
				castShadow
				shadow-mapSize-width={2048}
				shadow-mapSize-height={2048}
				shadow-camera-far={100}
				shadow-camera-left={-50}
				shadow-camera-right={50}
				shadow-camera-top={50}
				shadow-camera-bottom={-50}
			/>
			<hemisphereLight
				ref={hemisphereLightRef}
				intensity={config.hemisphereIntensity}
				color="#ffffff"
				groundColor="#8d7b68"
			/>
			<fog ref={fogRef} attach="fog" args={[config.fogColor, config.fogNear, config.fogFar]} />
		</>
	);
}
