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
		// When charging, show charge percentage (0% to 100%)
		statusPercentage = (chargeTime / maxChargeTime) * 100;
		statusColor = 'bg-blue-500';
		statusLabel = `${chargeTime.toFixed(1)}s`;
	} else if (cooldown > 0) {
		// When cooling down, show cooldown percentage (0% to 100%)
		statusPercentage = (cooldown / maxChargeTime) * 100;
		statusColor = 'bg-yellow-500';
		statusLabel = `${cooldown.toFixed(1)}s`;
	} else {
		// When ready, show empty bar
		statusPercentage = 0;
		statusColor = 'bg-green-500';
		statusLabel = 'READY';
	}

	// Determine if scream is ready
	const isReady = cooldown <= 0 && !isCharging;

	// Add pulse effect for charging
	const pulseClass = isCharging ? 'animate-pulse' : '';

	return (
		<div
			className="fixed top-32 right-4 bg-black bg-opacity-50 p-3 rounded-md text-white z-50"
			style={{ pointerEvents: 'none' }}
		>
			<div className="text-md font-semibold mb-1 flex justify-between">
				<span>bébé crie</span>
				<span
					className={`ml-3 px-2 py-0 rounded ${
						isReady ? 'text-green-500' : isCharging ? 'text-blue-500' : 'text-yellow-400'
					}`}
				>
					{statusLabel}
				</span>
			</div>
			<div className="w-48 h-5 bg-gray-700 rounded-full overflow-hidden">
				<div
					className={`h-full ${statusColor} transition-all duration-100 ${pulseClass}`}
					style={{ width: `${statusPercentage}%` }}
				/>
			</div>
			<div className="text-xs mt-1 text-center">
				{isCharging ? (
					<span>
						Hold <span className="px-2 py-0.5 bg-gray-700 rounded">LMB</span> to charge
					</span>
				) : cooldown > 0 ? (
					<span>Cooling down...</span>
				) : (
					<span>
						Click <span className="px-2 py-0.5 bg-gray-700 rounded">LMB</span> to scream
					</span>
				)}
			</div>
		</div>
	);
}
