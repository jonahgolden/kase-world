import { useQueryFirst } from 'koota/react';
import { useEffect, useState } from 'react';
import { Health, IsPlayer } from '../traits';

export function DamageEffect() {
	// Get the baby entity using useQueryFirst
	const playerEntity = useQueryFirst(IsPlayer, Health);

	const [isDamaged, setIsDamaged] = useState(false);

	// Check for damage to player
	useEffect(() => {
		if (!playerEntity) return;

		// Initial update using current entity data
		const health = playerEntity.get(Health);
		if (health) {
			setIsDamaged(health.isDamaged);
		}

		// Set up polling to track changes
		const intervalId = setInterval(() => {
			if (!playerEntity) return;

			const health = playerEntity.get(Health);
			if (health) {
				setIsDamaged(health.isDamaged);
			}
		}, 50);

		return () => clearInterval(intervalId);
	}, [playerEntity]); // Re-run when the entity reference changes

	// Return null if not damaged
	if (!isDamaged) return null;

	// Show red overlay when damaged
	return (
		<div
			className="fixed inset-0 pointer-events-none z-40 animate-flash"
			style={{
				background: 'radial-gradient(circle, rgba(255,0,0,0.8) 0%, rgba(255,0,0,0) 100%)',
				animationName: 'flash',
				animationDuration: '0.8s',
				animationIterationCount: '3',
				animationFillMode: 'forwards',
			}}
		/>
	);
}

// Add this to your global CSS or create a new style element
// This could also be added to a stylesheet if you have one
const flashAnimation = `
@keyframes flash {
  0%, 100% { opacity: 0; }
  50% { opacity: 1; }
}
`;

// Add the style to the document
if (typeof document !== 'undefined') {
	const style = document.createElement('style');
	style.innerHTML = flashAnimation;
	document.head.appendChild(style);
}
