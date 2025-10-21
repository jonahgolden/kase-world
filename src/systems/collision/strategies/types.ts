import * as THREE from 'three';
import { ColliderInstanceType, TransformType } from '../../../traits';

/**
 * Enum for different collision detection strategies
 */
export enum CollisionStrategy {
	STANDARD = 'STANDARD', // Current implementation with mixed approaches
	GJK = 'GJK', // Custom GJK implementation
	CANNON = 'CANNON', // Physics engine integration
}

/**
 * Common props for all collision checks
 */
export interface CollisionCheckProps {
	transformA: TransformType;
	colliderA: ColliderInstanceType;
	transformB: TransformType;
	colliderB: ColliderInstanceType;
}

/**
 * Result of a collision check
 */
export interface CollisionResult {
	normal: THREE.Vector3;
	penetration: number;
	point?: THREE.Vector3; // Optional collision point
}

/**
 * Interface that all collision handlers must implement
 */
export interface CollisionHandler {
	// Core collision detection
	checkCollision(props: CollisionCheckProps): CollisionResult | null;

	// Lifecycle methods
	initialize?(): void; // Setup work (especially for CANNON.js)
	cleanup?(): void; // Cleanup resources
	update?(): void; // Per-frame updates if needed

	// Debug visualization
	debugDraw?(): void; // For comparing approaches visually
}

/**
 * Factory function type for creating collision handlers
 */
export type CollisionHandlerFactory = () => CollisionHandler;
