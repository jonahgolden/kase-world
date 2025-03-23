import { useEffect, useState } from 'react';

interface GameOverScreenProps {
	isVisible: boolean;
	onRestart: () => void;
}

export function GameOverScreen({ isVisible, onRestart }: GameOverScreenProps) {
	const [fadeIn, setFadeIn] = useState(false);

	useEffect(() => {
		if (isVisible) {
			// Add small delay before fade-in for better visual effect
			const timer = setTimeout(() => {
				setFadeIn(true);
			}, 100);
			return () => clearTimeout(timer);
		} else {
			setFadeIn(false);
		}
	}, [isVisible]);

	if (!isVisible) return null;

	return (
		<div
			className={`fixed inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center z-50 transition-opacity duration-500 ${
				fadeIn ? 'opacity-100' : 'opacity-0'
			}`}
		>
			<div className="text-red-500 text-6xl font-bold mb-6 animate-pulse">GAME OVER</div>
			<div className="text-white text-xl mb-10">Your baby couldn't survive the dangers!</div>
			<button
				className="bg-red-600 hover:bg-red-700 text-white py-3 px-6 rounded-lg text-xl transition-colors duration-300"
				onClick={onRestart}
			>
				Try Again
			</button>
		</div>
	);
}
