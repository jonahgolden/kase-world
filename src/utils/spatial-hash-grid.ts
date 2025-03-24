import { Entity } from 'koota';
import * as THREE from 'three';
import { ColliderInstanceType, ColliderType } from '../traits/collider';

// Type for each cell in the grid
type Cell = Set<Entity>;

// Type for broadphase collision pairs
export type CollisionPair = {
	entityA: Entity;
	entityB: Entity;
};

/**
 * SpatialHashGrid for efficient broadphase collision detection
 * Divides 3D space into a grid of cells and tracks which entities are in each cell
 */
export class SpatialHashGrid {
	// Maps from cell hash (string) to set of entities in that cell
	public cells = new Map<string, Cell>();

	// Maps from entity to list of cell hashes it occupies
	public entityCells = new Map<Entity, string[]>();

	constructor(public cellSize: number) {}

	/**
	 * Inserts an entity into the grid based on its position and collider
	 * @param entity Entity to insert
	 * @param position Position of the entity
	 * @param collider Collider component of the entity
	 */
	insertEntity(entity: Entity, position: THREE.Vector3, collider: ColliderInstanceType) {
		// Get entity bounds based on collider type
		const bounds = this.getEntityBounds(position, collider);

		// Calculate the range of cells the entity overlaps
		const minCellX = Math.floor(bounds.min.x / this.cellSize);
		const maxCellX = Math.floor(bounds.max.x / this.cellSize);
		const minCellY = Math.floor(bounds.min.y / this.cellSize);
		const maxCellY = Math.floor(bounds.max.y / this.cellSize);
		const minCellZ = Math.floor(bounds.min.z / this.cellSize);
		const maxCellZ = Math.floor(bounds.max.z / this.cellSize);

		// Remove entity from previous cells
		this.removeEntity(entity);

		// Add entity to all cells it occupies
		const cellsOccupied: string[] = [];

		for (let x = minCellX; x <= maxCellX; x++) {
			for (let y = minCellY; y <= maxCellY; y++) {
				for (let z = minCellZ; z <= maxCellZ; z++) {
					const hash = this.hashCell(x, y, z);
					cellsOccupied.push(hash);

					if (!this.cells.has(hash)) {
						this.cells.set(hash, new Set());
					}

					this.cells.get(hash)!.add(entity);
				}
			}
		}

		// Store the cells this entity occupies
		this.entityCells.set(entity, cellsOccupied);
	}

	/**
	 * Removes an entity from all cells it occupies
	 * @param entity Entity to remove
	 */
	removeEntity(entity: Entity) {
		const cellsOccupied = this.entityCells.get(entity);

		if (cellsOccupied) {
			for (const hash of cellsOccupied) {
				const cell = this.cells.get(hash);
				if (cell) {
					cell.delete(entity);

					// Remove cell if empty
					if (cell.size === 0) {
						this.cells.delete(hash);
					}
				}
			}

			this.entityCells.delete(entity);
		}
	}

	/**
	 * Gets all potential collision pairs for broadphase collision detection
	 * @returns Array of entity pairs that potentially collide
	 */
	getPotentialCollisions(): CollisionPair[] {
		const pairs: CollisionPair[] = [];
		const pairSet = new Set<string>(); // Use string encoding of pairs to avoid duplicates

		// Go through each cell
		for (const [, cell] of this.cells.entries()) {
			// Skip if cell has fewer than 2 entities
			if (cell.size < 2) continue;

			// Get all potential pairs in this cell
			const entities = Array.from(cell);

			for (let i = 0; i < entities.length; i++) {
				for (let j = i + 1; j < entities.length; j++) {
					const a = entities[i];
					const b = entities[j];

					// Create unique hash for this pair
					const pairHash = this.getPairHash(a, b);

					// Skip if we've already found this pair
					if (pairSet.has(pairHash)) continue;

					pairSet.add(pairHash);
					pairs.push({ entityA: a, entityB: b });
				}
			}
		}

		return pairs;
	}

	/**
	 * Gets all entities within a radius from a point
	 * @param position Center point
	 * @param radius Radius to search within
	 * @returns Array of entities within the radius
	 */
	getNearbyEntities(position: THREE.Vector3, radius: number): Entity[] {
		const result: Entity[] = [];
		const foundEntities = new Set<Entity>();

		// Calculate grid cells that could contain entities within the radius
		const minCellX = Math.floor((position.x - radius) / this.cellSize);
		const maxCellX = Math.floor((position.x + radius) / this.cellSize);
		const minCellY = Math.floor((position.y - radius) / this.cellSize);
		const maxCellY = Math.floor((position.y + radius) / this.cellSize);
		const minCellZ = Math.floor((position.z - radius) / this.cellSize);
		const maxCellZ = Math.floor((position.z + radius) / this.cellSize);

		// Check all cells in the range
		for (let x = minCellX; x <= maxCellX; x++) {
			for (let y = minCellY; y <= maxCellY; y++) {
				for (let z = minCellZ; z <= maxCellZ; z++) {
					const hash = this.hashCell(x, y, z);
					const cell = this.cells.get(hash);

					if (cell) {
						// Add entities from this cell, avoiding duplicates
						for (const entity of cell) {
							if (!foundEntities.has(entity)) {
								foundEntities.add(entity);
								result.push(entity);
							}
						}
					}
				}
			}
		}

		return result;
	}

	/**
	 * Clear all entities from the grid
	 */
	clear() {
		this.cells.clear();
		this.entityCells.clear();
	}

	/**
	 * Calculate a bounding box for an entity based on its position and collider
	 * @param position Position of the entity
	 * @param collider Collider component of the entity
	 * @returns Bounding box that fully contains the entity
	 */
	private getEntityBounds(
		position: THREE.Vector3,
		collider: ColliderInstanceType
	): { min: THREE.Vector3; max: THREE.Vector3 } {
		// Position with offset applied
		const pos = position.clone().add(collider.offset);

		// Create bounding box based on collider type
		let halfSize: THREE.Vector3;

		switch (collider.type) {
			case ColliderType.SPHERE:
				return {
					min: new THREE.Vector3(pos.x - collider.radius, pos.y - collider.radius, pos.z - collider.radius),
					max: new THREE.Vector3(pos.x + collider.radius, pos.y + collider.radius, pos.z + collider.radius),
				};

			case ColliderType.BOX:
				halfSize = collider.size.clone().multiplyScalar(0.5);
				return {
					min: new THREE.Vector3(pos.x - halfSize.x, pos.y - halfSize.y, pos.z - halfSize.z),
					max: new THREE.Vector3(pos.x + halfSize.x, pos.y + halfSize.y, pos.z + halfSize.z),
				};

			case ColliderType.CAPSULE:
				// For capsule, create a bounding box that contains the entire capsule
				// Capsule has radius and height (extends along y-axis)
				return {
					min: new THREE.Vector3(
						pos.x - collider.radius,
						pos.y - collider.radius - collider.height * 0.5,
						pos.z - collider.radius
					),
					max: new THREE.Vector3(
						pos.x + collider.radius,
						pos.y + collider.radius + collider.height * 0.5,
						pos.z + collider.radius
					),
				};

			default:
				// Default to a small sphere if type is unknown
				return {
					min: new THREE.Vector3(pos.x - 0.5, pos.y - 0.5, pos.z - 0.5),
					max: new THREE.Vector3(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5),
				};
		}
	}

	/**
	 * Generate a hash for a grid cell
	 * @param x X coordinate of cell
	 * @param y Y coordinate of cell
	 * @param z Z coordinate of cell
	 * @returns String hash for the cell
	 */
	private hashCell(x: number, y: number, z: number): string {
		return `${x}:${y}:${z}`;
	}

	/**
	 * Generate a unique hash for an entity pair
	 * @param a First entity
	 * @param b Second entity
	 * @returns String hash for the entity pair
	 */
	private getPairHash(a: Entity, b: Entity): string {
		// Ensure consistent hash regardless of order
		const id1 = a.id;
		const id2 = b.id;

		return id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
	}
}
