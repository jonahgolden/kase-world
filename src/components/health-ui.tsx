import { useQueryFirst } from 'koota/react';
import { useEffect, useState } from 'react';
import { Health, IsPlayer } from '../traits';

export function HealthUI() {
	// Get the baby entity using useQueryFirst
	const babyEntity = useQueryFirst(IsPlayer, Health);

	const [healthData, setHealthData] = useState({
		current: 100,
		max: 100,
		isDamaged: false,
	});

	// Update health data from the entity
	useEffect(() => {
		if (!babyEntity) return;

		// Initial update using current entity data
		const health = babyEntity.get(Health);
		if (health) {
			setHealthData({
				current: health.current,
				max: health.max,
				isDamaged: health.isDamaged,
			});
		}

		// Set up polling to track changes
		const intervalId = setInterval(() => {
			if (!babyEntity) return;

			const health = babyEntity.get(Health);
			if (health) {
				setHealthData({
					current: health.current,
					max: health.max,
					isDamaged: health.isDamaged,
				});
			}
		}, 100); // Update every 100ms

		return () => clearInterval(intervalId);
	}, [babyEntity]); // Re-run when the entity reference changes

	const { current, max, isDamaged } = healthData;

	// Calculate health percentage
	const healthPercentage = (current / max) * 100;

	// Determine health bar color based on health level
	let healthBarColor = 'bg-green-500'; // Default: high health (>70%)
	if (healthPercentage <= 30) {
		healthBarColor = 'bg-red-500'; // Low health (<30%)
	} else if (healthPercentage <= 70) {
		healthBarColor = 'bg-yellow-500'; // Medium health (30-70%)
	}

	// Get animation class for damage feedback
	const damageAnimationClass = isDamaged ? 'animate-pulse' : '';

	return (
		<div
			className={`fixed top-4 left-4 bg-black bg-opacity-50 p-3 rounded-md text-white z-50 ${
				isDamaged ? 'border border-red-500' : ''
			}`}
			style={{ pointerEvents: 'none' }}
		>
			<div className="text-md font-semibold mb-1">Health</div>
			<div className="w-48 h-5 bg-gray-700 rounded-full overflow-hidden">
				<div
					className={`h-full ${healthBarColor} ${damageAnimationClass} transition-all duration-300`}
					style={{ width: `${healthPercentage}%` }}
				/>
			</div>
			<div className="text-xs mt-1 text-right">{`${Math.ceil(current)} / ${max}`}</div>
		</div>
	);
}
