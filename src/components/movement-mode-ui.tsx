import { useQueryFirst } from 'koota/react';
import { useEffect, useState } from 'react';
import { IsPlayer, MovementMode } from '../traits';

export function MovementModeUI() {
	// Get the baby entity using useQueryFirst
	const babyEntity = useQueryFirst(IsPlayer, MovementMode);

	const [modeData, setModeData] = useState({
		mode: 'crawl',
		walkDuration: 0,
		walkCooldown: 0,
		maxWalkDuration: 7,
		totalWalkCooldown: 10,
		canWalk: true,
	});

	// Update mode data from the entity
	useEffect(() => {
		if (!babyEntity) return;

		// Initial update using current entity data
		const movementMode = babyEntity.get(MovementMode);
		if (movementMode) {
			setModeData({
				mode: movementMode.mode,
				walkDuration: movementMode.walkDuration,
				walkCooldown: movementMode.walkCooldown,
				maxWalkDuration: movementMode.maxWalkDuration,
				totalWalkCooldown: movementMode.totalWalkCooldown,
				canWalk: movementMode.canWalk,
			});
		}

		// Set up polling to track changes
		const intervalId = setInterval(() => {
			if (!babyEntity) return;

			const movementMode = babyEntity.get(MovementMode);
			if (movementMode) {
				setModeData({
					mode: movementMode.mode,
					walkDuration: movementMode.walkDuration,
					walkCooldown: movementMode.walkCooldown,
					maxWalkDuration: movementMode.maxWalkDuration,
					totalWalkCooldown: movementMode.totalWalkCooldown,
					canWalk: movementMode.canWalk,
				});
			}
		}, 100); // Update every 100ms

		return () => clearInterval(intervalId);
	}, [babyEntity]); // Re-run when the entity reference changes

	const { mode, walkDuration, walkCooldown, maxWalkDuration, totalWalkCooldown, canWalk } = modeData;

	// Calculate percentages for the status bars
	const walkPercentage = (mode === 'walk' ? walkDuration / maxWalkDuration : 0) * 100;
	const cooldownPercentage = (walkCooldown > 0 ? walkCooldown / totalWalkCooldown : 0) * 100;

	return (
		<div
			style={{
				position: 'fixed',
				top: '80px', // Moved down to be below the visual mode toggle
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
					<span>Mode: {mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
					<span>{canWalk ? 'Ready' : 'Cooldown'}</span>
				</div>
				{/* Walk duration bar */}
				{mode === 'walk' && (
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
								width: `${walkPercentage}%`,
								height: '100%',
								backgroundColor: '#4CAF50',
								borderRadius: '5px',
								transition: 'width 0.1s ease-out',
							}}
						/>
					</div>
				)}
				{/* Cooldown bar */}
				{walkCooldown > 0 && (
					<div
						style={{
							width: '100%',
							height: '10px',
							backgroundColor: 'rgba(255, 255, 255, 0.2)',
							borderRadius: '5px',
							marginTop: '5px',
						}}
					>
						<div
							style={{
								width: `${cooldownPercentage}%`,
								height: '100%',
								backgroundColor: '#FFA500',
								borderRadius: '5px',
								transition: 'width 0.1s ease-out',
							}}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
