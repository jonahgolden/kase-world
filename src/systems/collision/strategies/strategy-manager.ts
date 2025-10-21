import { createStandardCollisionHandler } from './standard';
import { CollisionHandler, CollisionStrategy } from './types';

/**
 * Manages collision detection strategies and allows switching between them
 */
class CollisionStrategyManager {
	private static instance: CollisionStrategyManager;
	private currentStrategy: CollisionStrategy = CollisionStrategy.STANDARD;
	private handlers: Map<CollisionStrategy, CollisionHandler> = new Map();

	private constructor() {
		// Initialize with standard handler
		this.handlers.set(CollisionStrategy.STANDARD, createStandardCollisionHandler());
	}

	static getInstance(): CollisionStrategyManager {
		if (!CollisionStrategyManager.instance) {
			CollisionStrategyManager.instance = new CollisionStrategyManager();
		}
		return CollisionStrategyManager.instance;
	}

	getCurrentHandler(): CollisionHandler {
		const handler = this.handlers.get(this.currentStrategy);
		if (!handler) {
			throw new Error(`No handler found for strategy ${this.currentStrategy}`);
		}
		return handler;
	}

	setStrategy(strategy: CollisionStrategy): void {
		// Clean up current strategy if needed
		const currentHandler = this.handlers.get(this.currentStrategy);
		if (currentHandler?.cleanup) {
			currentHandler.cleanup();
		}

		// Initialize new strategy if needed
		const newHandler = this.handlers.get(strategy);
		if (newHandler?.initialize) {
			newHandler.initialize();
		}

		this.currentStrategy = strategy;
	}

	registerHandler(strategy: CollisionStrategy, handler: CollisionHandler): void {
		this.handlers.set(strategy, handler);
	}
}

export const collisionStrategyManager = CollisionStrategyManager.getInstance();
