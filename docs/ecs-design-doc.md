# Viber3D ECS Design Document

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core ECS Concepts](#core-ecs-concepts)
3. [System Interactions](#system-interactions)
4. [Trait Dependencies](#trait-dependencies)
5. [Component Guidelines](#component-guidelines)
6. [Collision System Implementation](#collision-system-implementation)
7. [Common Pitfalls](#common-pitfalls)

## Architecture Overview

Viber3D uses a hybrid architecture that combines:

- Koota ECS for game logic and state management
- React + React Three Fiber (R3F) for rendering
- Three.js for 3D rendering

This separation creates a clean architecture where:

- **Game Logic** is handled by ECS systems
- **Rendering** is handled by React components
- **Data** is stored in ECS traits

## Core ECS Concepts

### World

The central ECS container that holds all entities, traits, and systems.

### Entities

Game objects represented as unique IDs that can have traits attached.

### Traits

Data components that can be attached to entities. Two types:

- **Schema-based (SoA)**: For simple data types (numbers, booleans)
- **Callback-based (AoS)**: For complex objects (THREE.Vector3, etc.)

### Systems

Pure functions that process entities with specific trait combinations.

## System Interactions

### Rendering Pipeline

1. ECS systems update trait data (positions, states, etc.)
2. React components query for entities with specific traits
3. R3F components render the visual representation based on trait data

### Collision System

The collision system involves several interconnected parts:

1. `Collider` trait defines collision shapes and properties
2. `SpatialHashGrid` organizes entities for efficient collision detection
3. `collisionSystem` detects and resolves collisions
4. `syncView` system updates object positions based on Transform traits
5. `CollisionObjectsRenderer` ensures collision objects appear in the scene

## Trait Dependencies

### Required Trait Pairings

Some traits require others to function properly:

| Primary Trait     | Required Traits | Purpose                                      |
| ----------------- | --------------- | -------------------------------------------- |
| `Collider`        | `Transform`     | Position information for collision detection |
| `Ref`             | `Transform`     | Position/rotation/scale for rendered objects |
| `Movement`        | `Transform`     | Target for movement updates                  |
| `CollisionEvents` | `Collider`      | Events require collision detection           |

## Component Guidelines

### Rendering ECS Objects in React

To properly render ECS entities with Three.js objects:

1. **Create the Three.js object** in your component
2. **Attach it to the entity** using the `Ref` trait:
   ```tsx
   entity.add(Ref(threeJsObject));
   ```
3. **Add the object to the scene** using one of these patterns:
   - Return it directly in your R3F component
   - OR use a dedicated renderer component like `CollisionObjectsRenderer` that queries for entities with `Ref` traits and adds them to the scene

### Common Pattern for Object Rendering

```tsx
function ObjectRenderer() {
	const { scene } = useThree();
	const entities = useQuery(MyTrait, Ref);

	useEffect(() => {
		entities.forEach((entity) => {
			const obj = entity.get(Ref);
			if (obj && !scene.getObjectById(obj.id())) {
				scene.add(obj);
			}
		});

		return () => {
			// Cleanup code
		};
	}, [entities, scene]);

	return null;
}
```

## Collision System Implementation

### Traits

#### Collider

The core trait for collision detection that defines:

- Collider shape (Sphere, Box, or Capsule)
- Size, radius, or height parameters
- Collision layer and mask for filtering
- Physics properties (friction, restitution)
- Trigger flag for non-physical collisions

```typescript
export const Collider = trait(() => ({
	type: ColliderType.SPHERE,
	radius: 0.5,
	size: new THREE.Vector3(1, 1, 1),
	height: 0,
	offset: new THREE.Vector3(0, 0, 0),
	isTrigger: false,
	layer: CollisionLayer.DEFAULT,
	mask: 0xffffffff,
	friction: 0.3,
	restitution: 0.1,
}));
```

#### CollisionEvents

Trait for handling collision callbacks:

- `onCollisionEnter`: Called when collisions begin
- `onCollisionStay`: Called while collisions persist
- `onCollisionExit`: Called when collisions end
- Similar events for trigger volumes

### Spatial Optimization

The system uses a spatial hash grid for efficient collision detection:

1. World space is divided into cells
2. Entities are inserted into cells based on their position and size
3. Only entities in nearby cells are tested for collisions
4. This reduces the collision checks from O(n²) to O(n)

```typescript
// Example insertion into spatial hash grid
function updateSpatialHashing(world: World) {
	// Clear the grid
	const spatialHash = world.get(SpatialHashMap);
	if (!spatialHash) return;
	spatialHash.clear();

	// Insert entities with Transform and Collider
	world.query(Transform, Collider).forEach(([entity, transform, collider]) => {
		spatialHash.insertEntity(entity, transform.position, collider);
	});
}
```

### Collision Detection

The collision detection process follows these steps:

1. Update spatial hash grid with current entity positions
2. Retrieve potential collision pairs from the grid
3. Perform more precise collision tests based on collider types
4. Filter collisions based on layers and masks
5. Generate collision events for all valid collisions
6. Apply physics responses for non-trigger collisions

### Integration with Visual Rendering

To visualize colliders or debug collision detection:

1. Create Three.js objects that match collider shapes
2. Add them to entities with the `Ref` trait
3. Use the `CollisionObjectsRenderer` component to add them to the scene

```typescript
// Example of adding visualization for a collider entity
function addColliderObject(world: World, type: ColliderType, position: THREE.Vector3) {
	const entity = world.spawn(Transform({ position }), Collider({ type }));

	const geometry =
		type === ColliderType.SPHERE
			? new THREE.SphereGeometry(entity.get(Collider)?.radius || 1)
			: new THREE.BoxGeometry(1, 1, 1);

	const material = new THREE.MeshStandardMaterial({
		color: 'blue',
		transparent: true,
		opacity: 0.5,
	});

	const mesh = new THREE.Mesh(geometry, material);
	entity.add(Ref(mesh));

	return entity;
}
```

### Collision Response

For non-trigger colliders, the system calculates and applies appropriate physics responses:

1. Calculate collision normal and penetration depth
2. Apply separation forces to resolve overlap
3. Calculate bounce and friction based on material properties
4. Update entity velocities and positions

### Adding Colliders to Existing Entities

When adding colliders to existing entities, ensure:

1. The entity already has a `Transform` trait
2. The collider's dimensions match the visual representation
3. Set appropriate collision layers and masks
4. Add `CollisionEvents` trait if collision callbacks are needed

```typescript
// Example of adding a collider to the baby entity
actions.spawnPlayer = () => {
	return world.spawn(
		IsPlayer,
		Transform({
			/* ... */
		}),
		Movement({
			/* ... */
		}),
		Collider({
			type: ColliderType.CAPSULE,
			radius: 0.2,
			height: 0.4,
			layer: CollisionLayer.CHARACTER,
			mask: CollisionLayer.DEFAULT | CollisionLayer.TRIGGER,
		}),
		CollisionEvents()
	);
};
```

## Common Pitfalls

### Missing Rendered Objects

**Problem**: Objects with `Ref` traits aren't visible in the scene.  
**Solution**: Ensure the Three.js object is added to the scene graph using one of these methods:

1. Return it directly in an R3F component
2. Use `scene.add(object)` in a useEffect hook
3. Create a dedicated renderer component that queries for entities with `Ref` traits

### Incorrect Object Transforms

**Problem**: Objects aren't positioned correctly relative to their `Transform` traits.  
**Solution**: Ensure the `syncView` system is running and properly updating objects with both `Transform` and `Ref` traits.

### Collisions Not Working

**Problem**: Entities with `Collider` traits aren't colliding.  
**Solution**: Check that:

1. Both entities have `Collider` and `Transform` traits
2. `collisionSystem` is running in the game loop
3. Collision layers and masks are compatible
4. Entities are being updated in the spatial hash grid

### Memory Leaks with Three.js Objects

**Problem**: Three.js objects remain in memory after entities are destroyed.  
**Solution**: Implement proper cleanup in renderer components:

1. Track added objects
2. Remove them from the scene when entities are destroyed
3. Dispose of geometries and materials when no longer needed
