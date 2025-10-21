import { Entity, World } from 'koota';
import * as THREE from 'three';
import { BoxCollider, CollisionEvents, CollisionLayer, getPhysicsBody, Transform } from '../traits';
import { Ref } from '../traits/ref';

// Building properties interface
interface BuildingProps {
	world: World;
	position?: THREE.Vector3;
	rotation?: THREE.Euler;
	size?: THREE.Vector3;
	color?: string;
}

/**
 * Creates a building entity in the world
 * Buildings are static terrain objects with box colliders
 */
export function createBuilding({
	world,
	position = new THREE.Vector3(),
	rotation = new THREE.Euler(),
	size = new THREE.Vector3(5, 3, 5), // Default size for buildings
	color = '#888888', // Default gray color
}: BuildingProps): Entity {
	// Create building entity with required traits
	const entity = world.spawn(
		Transform({ position, rotation }),
		BoxCollider({
			size,
			layer: CollisionLayer.TERRAIN, // Buildings use TERRAIN layer
			mask: CollisionLayer.ALL, // Collide with everything
		}),
		CollisionEvents(), // Add collision events
		getPhysicsBody({ isStatic: true }) // Buildings are static and immovable
	);

	// Create mesh for visualization
	const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
	const material = new THREE.MeshStandardMaterial({
		color,
		roughness: 0.7,
		metalness: 0.2,
	});

	const mesh = new THREE.Mesh(geometry, material);
	entity.add(Ref(mesh));

	return entity;
}

/**
 * Creates a simple house at the specified position
 */
export function createSimpleHouse({
	world,
	position = new THREE.Vector3(),
	rotation = new THREE.Euler(),
}: Omit<BuildingProps, 'size' | 'color'>): Entity {
	return createBuilding({
		world,
		position,
		rotation,
		size: new THREE.Vector3(4, 2.5, 4),
		color: '#a86032', // Brown color for house
	});
}

/**
 * Creates a tall building at the specified position
 */
export function createTallBuilding({
	world,
	position = new THREE.Vector3(),
	rotation = new THREE.Euler(),
}: Omit<BuildingProps, 'size' | 'color'>): Entity {
	return createBuilding({
		world,
		position,
		rotation,
		size: new THREE.Vector3(6, 15, 6),
		color: '#3f4c69', // Blue-gray color
	});
}

/**
 * Creates a giant circus tent where Duogringo can spawn inside
 * The tent has red and white striped walls, a cone roof, and an entrance opening
 */
export function createDuogringoSpawnBuilding({
	world,
	position = new THREE.Vector3(20, 0, 0), // Default 20 units from origin, at ground level
	rotation = new THREE.Euler(),
}: Omit<BuildingProps, 'size' | 'color'>): Entity[] {
	const tentParts: Entity[] = [];
	const tentRadius = 8; // Make tent larger for visibility
	const tentHeight = 12; // Make tent taller
	const roofHeight = 8;

	// Ensure tent is above ground by adding offset
	const tentGroundOffset = 2; // Raise tent 2 units above terrain
	const adjustedPosition = new THREE.Vector3(position.x, position.y + tentGroundOffset, position.z);

	// Create circular floor
	const floorGeometry = new THREE.CylinderGeometry(tentRadius + 1, tentRadius + 1, 0.5, 32);
	const floorMaterial = new THREE.MeshStandardMaterial({
		color: '#8B4513', // Dark brown floor for visibility
		roughness: 0.6,
		metalness: 0.1,
	});
	const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
	floorMesh.position.copy(adjustedPosition);
	floorMesh.position.y += 0.25; // Half of floor thickness

	const floorEntity = world.spawn(
		Transform({
			position: floorMesh.position.clone(),
			rotation: rotation.clone(),
		}),
		Ref(floorMesh)
	);
	tentParts.push(floorEntity);

	// Create floor collision
	const floorCollisionEntity = world.spawn(
		Transform({
			position: new THREE.Vector3(adjustedPosition.x, adjustedPosition.y + 0.25, adjustedPosition.z),
			rotation: rotation.clone(),
		}),
		BoxCollider({
			size: new THREE.Vector3(tentRadius * 2, 0.5, tentRadius * 2),
			layer: CollisionLayer.TERRAIN,
			mask: CollisionLayer.ALL,
		}),
		CollisionEvents(),
		getPhysicsBody({ isStatic: true })
	);
	tentParts.push(floorCollisionEntity);

	// Create tent walls with red/white stripes
	const wallHeight = tentHeight - roofHeight;

	// Create striped texture for tent walls
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 256;
	const ctx = canvas.getContext('2d')!;

	// Draw red and white stripes
	const stripeWidth = canvas.width / 16; // 16 stripes total
	for (let i = 0; i < 16; i++) {
		ctx.fillStyle = i % 2 === 0 ? '#DC143C' : '#FFFFFF'; // Red and white
		ctx.fillRect(i * stripeWidth, 0, stripeWidth, canvas.height);
	}

	const stripeTexture = new THREE.CanvasTexture(canvas);
	stripeTexture.wrapS = THREE.RepeatWrapping;
	stripeTexture.wrapT = THREE.RepeatWrapping;
	stripeTexture.repeat.set(4, 1); // Repeat the stripes around the cylinder

	const wallMaterial = new THREE.MeshStandardMaterial({
		map: stripeTexture,
		side: THREE.DoubleSide,
		roughness: 0.7,
		metalness: 0.1,
	});

	// Create wall segments with a gap for entrance
	const wallSegmentGeometry = new THREE.CylinderGeometry(
		tentRadius,
		tentRadius,
		wallHeight,
		32,
		1,
		true,
		0,
		Math.PI * 1.7
	); // 306 degrees, leaving gap
	const wallMesh = new THREE.Mesh(wallSegmentGeometry, wallMaterial);
	wallMesh.position.copy(adjustedPosition);
	wallMesh.position.y += wallHeight / 2;

	const wallEntity = world.spawn(
		Transform({
			position: wallMesh.position.clone(),
			rotation: rotation.clone(),
		}),
		Ref(wallMesh)
	);
	tentParts.push(wallEntity);

	// Create collision boxes that align with the visual tent walls
	const wallThickness = 0.5; // Thinner walls to match visual tent thickness

	// Create circular collision segments that match the visual tent shape
	const numCollisionSegments = 12; // 12 segments for smooth circular collision
	const entranceAngleStart = -0.4; // Start of entrance gap (in radians)
	const entranceAngleEnd = 0.4; // End of entrance gap (in radians)
	const segmentWidth = (2 * Math.PI * tentRadius) / numCollisionSegments; // Arc length per segment

	for (let i = 0; i < numCollisionSegments; i++) {
		const angle = (i / numCollisionSegments) * Math.PI * 2;

		// Skip segments that are in the entrance area
		if (angle >= entranceAngleStart && angle <= entranceAngleEnd) {
			continue;
		}

		// Position collision box just inside the visual tent wall
		const collisionRadius = tentRadius - 0.2; // Slightly inside the visual tent
		const collisionX = adjustedPosition.x + Math.cos(angle) * collisionRadius;
		const collisionZ = adjustedPosition.z + Math.sin(angle) * collisionRadius;

		const collisionEntity = world.spawn(
			Transform({
				position: new THREE.Vector3(collisionX, adjustedPosition.y + wallHeight / 2, collisionZ),
				rotation: new THREE.Euler(0, angle + Math.PI / 2, 0), // Orient perpendicular to radius
			}),
			BoxCollider({
				size: new THREE.Vector3(segmentWidth, wallHeight, wallThickness), // Properly sized segments
				layer: CollisionLayer.TERRAIN,
				mask: CollisionLayer.ALL,
			}),
			CollisionEvents(),
			getPhysicsBody({ isStatic: true })
		);
		tentParts.push(collisionEntity);
	}

	// Create tent roof (cone)
	const roofGeometry = new THREE.ConeGeometry(tentRadius + 0.5, roofHeight, 32);
	const roofMaterial = new THREE.MeshStandardMaterial({
		map: stripeTexture,
		roughness: 0.6,
		metalness: 0.1,
	});
	const roofMesh = new THREE.Mesh(roofGeometry, roofMaterial);
	roofMesh.position.copy(adjustedPosition);
	roofMesh.position.y += wallHeight + roofHeight / 2;

	const roofEntity = world.spawn(
		Transform({
			position: roofMesh.position.clone(),
			rotation: rotation.clone(),
		}),
		Ref(roofMesh)
	);
	tentParts.push(roofEntity);

	// Create collision for the roof (so baby can't jump over walls)
	const roofCollisionEntity = world.spawn(
		Transform({
			position: new THREE.Vector3(
				adjustedPosition.x,
				adjustedPosition.y + wallHeight + roofHeight / 3,
				adjustedPosition.z
			),
			rotation: rotation.clone(),
		}),
		BoxCollider({
			size: new THREE.Vector3(tentRadius * 1.8, 0.5, tentRadius * 1.8), // Flat collision plane
			layer: CollisionLayer.TERRAIN,
			mask: CollisionLayer.ALL,
		}),
		CollisionEvents(),
		getPhysicsBody({ isStatic: true })
	);
	tentParts.push(roofCollisionEntity);

	// Create central tent pole
	const poleGeometry = new THREE.CylinderGeometry(0.15, 0.15, tentHeight, 8);
	const poleMaterial = new THREE.MeshStandardMaterial({
		color: '#654321', // Darker brown for better visibility
		roughness: 0.7,
		metalness: 0.2,
	});
	const poleMesh = new THREE.Mesh(poleGeometry, poleMaterial);
	poleMesh.position.copy(adjustedPosition);
	poleMesh.position.y += tentHeight / 2;

	const poleEntity = world.spawn(
		Transform({
			position: poleMesh.position.clone(),
			rotation: rotation.clone(),
		}),
		Ref(poleMesh)
	);
	tentParts.push(poleEntity);

	// Create pole collision
	const poleCollisionEntity = world.spawn(
		Transform({
			position: new THREE.Vector3(
				adjustedPosition.x,
				adjustedPosition.y + tentHeight / 2,
				adjustedPosition.z
			),
			rotation: rotation.clone(),
		}),
		BoxCollider({
			size: new THREE.Vector3(0.3, tentHeight, 0.3), // Slightly bigger collision
			layer: CollisionLayer.TERRAIN,
			mask: CollisionLayer.ALL,
		}),
		CollisionEvents(),
		getPhysicsBody({ isStatic: true })
	);
	tentParts.push(poleCollisionEntity);

	// Create tent peak flag
	const flagGeometry = new THREE.PlaneGeometry(1.5, 1);
	const flagMaterial = new THREE.MeshStandardMaterial({
		color: '#FFD700', // Bright gold
		side: THREE.DoubleSide,
		roughness: 0.3,
		metalness: 0.2,
	});
	const flagMesh = new THREE.Mesh(flagGeometry, flagMaterial);
	flagMesh.position.copy(adjustedPosition);
	flagMesh.position.y += tentHeight + 0.5;
	flagMesh.rotation.y = Math.PI / 4; // Angle the flag

	const flagEntity = world.spawn(
		Transform({
			position: flagMesh.position.clone(),
			rotation: new THREE.Euler(0, Math.PI / 4, 0),
		}),
		Ref(flagMesh)
	);
	tentParts.push(flagEntity);

	return tentParts;
}
