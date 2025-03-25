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
			className="fixed top-4 right-4 bg-black bg-opacity-50 p-3 rounded-md text-white z-50"
			style={{ pointerEvents: 'none' }}
		>
			<div className="text-md font-semibold mb-1">
				{mode === 'walk' ? 'Walking' : 'Crawling'}
				{!canWalk && mode === 'crawl' && ' (Cooldown)'}
			</div>

			{/* Walk duration bar */}
			{mode === 'walk' && (
				<div className="mb-2">
					<div className="text-xs mb-1">Walk Duration</div>
					<div className="w-48 h-3 bg-gray-700 rounded-full overflow-hidden">
						<div
							className="h-full bg-green-500 transition-all duration-100"
							style={{ width: `${walkPercentage}%` }}
						/>
					</div>
				</div>
			)}

			{/* Cooldown bar - only show when in cooldown */}
			{walkCooldown > 0 && (
				<div>
					<div className="text-xs mb-1">Cooldown</div>
					<div className="w-48 h-3 bg-gray-700 rounded-full overflow-hidden">
						<div
							className="h-full bg-red-500 transition-all duration-100"
							style={{ width: `${cooldownPercentage}%` }}
						/>
					</div>
				</div>
			)}

			{/* Instructions */}
			<div className="text-xs mt-2 text-gray-300">Hold [Shift] to walk</div>
		</div>
	);
}
