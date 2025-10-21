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
 * Contains all necessary information for physics response and debugging
 */
export interface CollisionResult {
	// Core collision data [P1]
	normal: THREE.Vector3; // Direction of collision from A to B
	penetration: number; // Penetration depth
	point?: THREE.Vector3; // Point of contact

	// Physics integration data [P1]
	impulse?: THREE.Vector3; // Collision response force
	frictionImpulse?: THREE.Vector3; // Friction force at collision point
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
