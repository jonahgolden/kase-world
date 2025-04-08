// Originally by Hendrik Mans: https://github.com/hmans/miniplex/blob/main/apps/demo/src/systems/SpatialHashingSystem.tsx

import { Entity } from 'koota';
import * as THREE from 'three';

type Cell = Set<Entity>;

export class SpatialHashMap {
	protected cells = new Map<string, Cell>();
	protected entityToCell = new Map<Entity, Cell>();
	protected entityPositions = new Map<Entity, THREE.Vector3>();
	protected tempVec3 = new THREE.Vector3();

	constructor(public cellSize: number) {}

	setEntity(entity: Entity, x: number, y: number, z: number) {
		const cell = this.getCell(x, y, z);

		/* Remove from previous hash if known */
		const oldCell = this.entityToCell.get(entity);

		if (oldCell) {
			/* If hash didn't change, do nothing */
			if (oldCell === cell) {
				// Update position even if cell hasn't changed
				this.entityPositions.set(entity, new THREE.Vector3(x, y, z));
				return;
			}

			/* Remove from previous hash */
			oldCell.delete(entity);

			// Clean up empty cells
			if (oldCell.size === 0) {
				const oldHash = this.findCellHash(oldCell);
				if (oldHash) this.cells.delete(oldHash);
			}
		}

		cell.add(entity);
		this.entityToCell.set(entity, cell);
		this.entityPositions.set(entity, new THREE.Vector3(x, y, z));
	}

	removeEntity(entity: Entity) {
		const cell = this.entityToCell.get(entity);
		if (cell) {
			cell.delete(entity);
			// Clean up empty cells
			if (cell.size === 0) {
				const hash = this.findCellHash(cell);
				if (hash) this.cells.delete(hash);
			}
		}
		this.entityToCell.delete(entity);
		this.entityPositions.delete(entity);
	}

	getNearbyEntities(
		x: number,
		y: number,
		z: number,
		radius: number,
		entities: Entity[] = [],
		maxEntities = Infinity,
		checkDistance = true
	) {
		let count = 0;
		entities.length = 0;
		const radiusSq = radius * radius;

		// Calculate the cell coordinates that contain the sphere defined by radius
		const minCellX = Math.floor((x - radius) / this.cellSize);
		const maxCellX = Math.floor((x + radius) / this.cellSize);
		const minCellY = Math.floor((y - radius) / this.cellSize);
		const maxCellY = Math.floor((y + radius) / this.cellSize);
		const minCellZ = Math.floor((z - radius) / this.cellSize);
		const maxCellZ = Math.floor((z + radius) / this.cellSize);

		this.tempVec3.set(x, y, z);

		// Iterate through all cells that might contain entities within the radius
		for (let cx = minCellX; cx <= maxCellX; cx++) {
			for (let cy = minCellY; cy <= maxCellY; cy++) {
				for (let cz = minCellZ; cz <= maxCellZ; cz++) {
					const cell = this.getCell(cx * this.cellSize, cy * this.cellSize, cz * this.cellSize);

					for (const entity of cell) {
						if (checkDistance) {
							const pos = this.entityPositions.get(entity);
							if (!pos || pos.distanceToSquared(this.tempVec3) > radiusSq) {
								continue;
							}
						}

						entities.push(entity);
						count++;

						if (count >= maxEntities) return entities;
					}
				}
			}
		}

		return entities;
	}

	reset() {
		this.cells.clear();
		this.entityToCell.clear();
		this.entityPositions.clear();
	}

	protected getCell(x: number, y: number, z: number) {
		const hash = this.calculateHash(x, y, z, this.cellSize);

		if (!this.cells.has(hash)) {
			this.cells.set(hash, new Set());
		}

		return this.cells.get(hash)!;
	}

	protected calculateHash(x: number, y: number, z: number, cellSize: number) {
		const hx = Math.floor(x / cellSize);
		const hy = Math.floor(y / cellSize);
		const hz = Math.floor(z / cellSize);

		return `${hx}:${hy}:${hz}`;
	}

	protected findCellHash(cell: Cell): string | undefined {
		for (const [hash, c] of this.cells.entries()) {
			if (c === cell) return hash;
		}
		return undefined;
	}
}
