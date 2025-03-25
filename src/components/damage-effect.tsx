import { useQueryFirst } from 'koota/react';
import { useEffect, useState } from 'react';
import { Health, IsPlayer } from '../traits';

export function DamageEffect() {
	// Get the baby entity using useQueryFirst
	const babyEntity = useQueryFirst(IsPlayer, Health);

	const [isDamaged, setIsDamaged] = useState(false);

	// Check for baby damage state
	useEffect(() => {
		if (!babyEntity) return;

		// Initial update using current entity data
		const health = babyEntity.get(Health);
		if (health) {
			setIsDamaged(health.isDamaged);
		}

		// Set up polling to track changes
		const intervalId = setInterval(() => {
			if (!babyEntity) return;

			const health = babyEntity.get(Health);
			if (health) {
				setIsDamaged(health.isDamaged);
			}
		}, 50); // Check more frequently for responsive feedback

		return () => clearInterval(intervalId);
	}, [babyEntity]); // Re-run when the entity reference changes

	// Return null if not damaged
	if (!isDamaged) return null;

	// Show red overlay when damaged
	return (
		<div
			className="fixed inset-0 bg-red-500 bg-opacity-30 pointer-events-none z-40 animate-flash"
			style={{
				animation: 'flash 0.2s 3',
			}}
		/>
	);
}

// Add this to your global CSS or create a new style element
// This could also be added to a stylesheet if you have one
const flashAnimation = `
@keyframes flash {
  0%, 100% { opacity: 0; }
  50% { opacity: 0.3; }
}
`;

// Add the style to the document
if (typeof document !== 'undefined') {
	const style = document.createElement('style');
	style.innerHTML = flashAnimation;
	document.head.appendChild(style);
}
