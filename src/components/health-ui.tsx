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
	let healthBarColor = '#4CAF50'; // Default: high health (>70%)
	if (healthPercentage <= 30) {
		healthBarColor = '#F44336'; // Low health (<30%)
	} else if (healthPercentage <= 70) {
		healthBarColor = '#FFA500'; // Medium health (30-70%)
	}

	return (
		<div
			style={{
				position: 'fixed',
				top: '280px', // Moved down to be below the scream UI
				right: '20px',
				backgroundColor: 'rgba(0, 0, 0, 0.5)',
				padding: '10px',
				borderRadius: '10px',
				color: 'white',
				fontFamily: 'Arial, sans-serif',
				backdropFilter: 'blur(5px)',
				minWidth: '200px',
			}}
		>
			<div style={{ marginBottom: '10px' }}>
				<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
					<span>Health</span>
					<span>{Math.round(healthPercentage)}%</span>
				</div>
				{/* Health bar */}
				<div
					style={{
						width: '100%',
						height: '10px',
						backgroundColor: 'rgba(255, 255, 255, 0.2)',
						borderRadius: '5px',
					}}
				>
					<div
						style={{
							width: `${healthPercentage}%`,
							height: '100%',
							backgroundColor: healthBarColor,
							borderRadius: '5px',
							transition: 'width 0.1s ease-out',
							animation: isDamaged ? 'pulse 0.5s ease-in-out' : 'none',
						}}
					/>
				</div>
			</div>
		</div>
	);
}
