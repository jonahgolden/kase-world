import { Html } from '@react-three/drei';
import { Entity } from 'koota';
import { useTraitEffect } from 'koota/react';
import { useRef } from 'react';
import { Health } from '../traits';

interface DuogringoHealthBarProps {
	entity: Entity;
}

export function DuogringoHealthBar({ entity }: DuogringoHealthBarProps) {
	const healthPercentageRef = useRef(100);

	// Listen for health changes
	useTraitEffect(entity, Health, (health) => {
		if (health) {
			healthPercentageRef.current = (health.current / health.max) * 100;
		}
	});

	// Don't render if entity doesn't have health or is at full health
	const health = entity.get(Health);
	if (!health || health.current >= health.max) {
		return null;
	}

	const healthPercentage = (health.current / health.max) * 100;
	const isDamaged = health.isDamaged;

	return (
		<Html
			position={[0, 1.5, 0]} // Position above Duogringo head
			center
			distanceFactor={8}
			style={{
				pointerEvents: 'none',
				userSelect: 'none',
			}}
		>
			<div className="flex flex-col items-center">
				{/* Health bar container */}
				<div
					className={`
						w-12 h-2 bg-gray-800 rounded-full border border-gray-600 overflow-hidden
						${isDamaged ? 'animate-pulse' : ''}
					`}
				>
					{/* Health bar fill */}
					<div
						className={`
							h-full transition-all duration-300 ease-out
							${healthPercentage > 60 ? 'bg-green-500' : healthPercentage > 30 ? 'bg-yellow-500' : 'bg-red-500'}
						`}
						style={{
							width: `${Math.max(0, healthPercentage)}%`,
						}}
					/>
				</div>

				{/* Health text */}
				<div className="text-xs text-white font-bold mt-1 text-center bg-black bg-opacity-60 px-1 rounded">
					{Math.ceil(health.current)}/{health.max}
				</div>
			</div>
		</Html>
	);
}
