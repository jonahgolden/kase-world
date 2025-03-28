import { useQueryFirst } from 'koota/react';
import { useEffect, useState } from 'react';
// import { IsPlayer, Scream } from '../traits';
import { IsPlayer, Scream } from '../traits';

export function ScreamUI() {
	// Get the baby entity using useQueryFirst
	const babyEntity = useQueryFirst(IsPlayer, Scream);

	const [screamData, setScreamData] = useState({
		cooldown: 0,
		isCharging: false,
		chargeTime: 0,
		maxChargeTime: 2.5,
	});

	// Update scream data from the entity
	useEffect(() => {
		if (!babyEntity) return;

		// Initial update using current entity data
		const scream = babyEntity.get(Scream);
		if (scream) {
			setScreamData({
				cooldown: scream.cooldown,
				isCharging: scream.isCharging,
				chargeTime: scream.chargeTime,
				maxChargeTime: scream.maxChargeTime,
			});
		}

		// Set up polling to track changes
		const intervalId = setInterval(() => {
			if (!babyEntity) return;

			const scream = babyEntity.get(Scream);
			if (scream) {
				setScreamData({
					cooldown: scream.cooldown,
					isCharging: scream.isCharging,
					chargeTime: scream.chargeTime,
					maxChargeTime: scream.maxChargeTime,
				});
			}
		}, 100); // Update every 100ms

		return () => clearInterval(intervalId);
	}, [babyEntity]); // Re-run when the entity reference changes

	const { cooldown, isCharging, chargeTime, maxChargeTime } = screamData;

	// Calculate percentage for the status bar
	// - When charging: bar goes up (0% to 100%)
	// - When cooling down: bar goes down (100% to 0%)
	// - When ready: bar is empty (0%)
	let statusPercentage = 0;
	let statusColor = '';
	let statusLabel = '';

	if (isCharging) {
		statusPercentage = (chargeTime / maxChargeTime) * 100;
		statusColor = '#4CAF50'; // Green
		statusLabel = 'Charging';
	} else if (cooldown > 0) {
		statusPercentage = (cooldown / 3.0) * 100; // 3.0 is the cooldown duration
		statusColor = '#FFA500'; // Orange
		statusLabel = 'Cooldown';
	} else {
		statusLabel = 'Ready';
	}

	return (
		<div
			style={{
				position: 'fixed',
				top: '180px', // Moved down to be below the movement mode UI
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
					<span>Scream</span>
					<span>{statusLabel}</span>
				</div>
				{/* Status bar */}
				{(isCharging || cooldown > 0) && (
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
								width: `${statusPercentage}%`,
								height: '100%',
								backgroundColor: statusColor,
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
