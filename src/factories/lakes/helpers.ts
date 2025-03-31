import { Vector3 } from 'three';
import { LakeData, LAKES_DATA } from './const';

type PointData = Vector3 | { x: number; z: number; y?: number };

export function pointIsInLake(point: PointData): boolean {
	return LAKES_DATA.some(({ center, radius }) => horizontalDistance(point, center) < radius);
}

export function closestLakeToPoint(point: PointData) {
	let closestLake: LakeData | undefined;
	let distanceToClosestLake: number = Infinity;

	LAKES_DATA.forEach((lakeX) => {
		const distanceToLakeX = horizontalDistance(point, lakeX.center);
		if (distanceToLakeX < distanceToClosestLake) {
			closestLake = lakeX;
			distanceToClosestLake = distanceToLakeX;
		}
	});

	return { closestLake, distanceToClosestLake };
}

function horizontalDistance(pointA: { x: number; z: number }, pointB: { x: number; z: number }): number {
	return Math.sqrt(Math.pow(pointA.x - pointB.x, 2) + Math.pow(pointA.z - pointB.z, 2));
}
