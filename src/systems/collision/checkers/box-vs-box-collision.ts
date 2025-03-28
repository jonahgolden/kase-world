import { Matrix4, Vector3 } from 'three';
import { CheckCollisionProps } from './check-collision';

export function checkBoxVsBox({ transformA, colliderA, transformB, colliderB }: CheckCollisionProps) {
	// Apply collider offsets to positions
	const posA = new Vector3().copy(transformA.position).add(colliderA.offset);
	const posB = new Vector3().copy(transformB.position).add(colliderB.offset);

	// Calculate half sizes considering scale
	const halfSizeA = colliderA.size.clone().multiply(transformA.scale).multiplyScalar(0.5);
	const halfSizeB = colliderB.size.clone().multiply(transformB.scale).multiplyScalar(0.5);

	// Create rotation matrices from Euler angles
	const matrixA = new Matrix4().makeRotationFromEuler(transformA.rotation);
	const matrixB = new Matrix4().makeRotationFromEuler(transformB.rotation);

	// Get the box axes (normalized direction vectors)
	const axesA = [
		new Vector3(1, 0, 0).applyMatrix4(matrixA),
		new Vector3(0, 1, 0).applyMatrix4(matrixA),
		new Vector3(0, 0, 1).applyMatrix4(matrixA),
	];
	const axesB = [
		new Vector3(1, 0, 0).applyMatrix4(matrixB),
		new Vector3(0, 1, 0).applyMatrix4(matrixB),
		new Vector3(0, 0, 1).applyMatrix4(matrixB),
	];

	// Get all axes to test
	const axes = [...axesA, ...axesB];
	// Add cross products of all pairs of axes
	for (const axisA of axesA) {
		for (const axisB of axesB) {
			const cross = new Vector3().crossVectors(axisA, axisB);
			if (cross.lengthSq() > 0.001) {
				// Ignore parallel axes
				cross.normalize();
				axes.push(cross);
			}
		}
	}

	// Calculate the vector between box centers
	const centerDiff = new Vector3().subVectors(posB, posA);

	let minPenetration = Infinity;
	let minAxis = axes[0];

	// Test all axes (Separating Axis Theorem)
	for (const axis of axes) {
		// Project box A's half-extents onto the axis
		const projA =
			Math.abs(axesA[0].dot(axis) * halfSizeA.x) +
			Math.abs(axesA[1].dot(axis) * halfSizeA.y) +
			Math.abs(axesA[2].dot(axis) * halfSizeA.z);

		// Project box B's half-extents onto the axis
		const projB =
			Math.abs(axesB[0].dot(axis) * halfSizeB.x) +
			Math.abs(axesB[1].dot(axis) * halfSizeB.y) +
			Math.abs(axesB[2].dot(axis) * halfSizeB.z);

		// Project the center difference vector onto the axis
		const centerProj = centerDiff.dot(axis);

		// Calculate overlap
		const overlap = projA + projB - Math.abs(centerProj);

		// If there's no overlap on any axis, the boxes don't intersect
		if (overlap <= 0) {
			return null;
		}

		// Keep track of minimum penetration
		if (overlap < minPenetration) {
			minPenetration = overlap;
			minAxis = axis;
		}
	}

	// Ensure the normal points from A to B
	const normal = minAxis.clone();
	if (centerDiff.dot(normal) < 0) {
		normal.multiplyScalar(-1);
	}

	return {
		normal,
		penetration: minPenetration,
		point: new Vector3().addVectors(posA, normal.clone().multiplyScalar(minPenetration * 0.5)),
	};
}
