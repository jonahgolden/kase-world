# Kase World - Architecture Documentation

## Overview

Kase World is a first-person baby simulator game built with React, Three.js, and Rapier physics. The game uses an Entity Component System (ECS) architecture via Koota for game logic, with React Three Fiber for rendering and Rapier for physics simulation.

## Tech Stack

- **React** - UI framework and component architecture
- **Three.js** - 3D graphics and rendering
- **React Three Fiber (R3F)** - React renderer for Three.js
- **@react-three/rapier** - Physics engine integration
- **Koota ECS** - Lightweight Entity Component System for game logic
- **TypeScript** - Type safety and developer experience
- **Vite** - Fast build tooling

## Architecture Layers

### 1. ECS Layer (Game State)

The game uses Koota ECS to manage all game entities and their data. This keeps game logic decoupled from rendering.

**Key Concepts:**
- **Entities**: Unique IDs representing game objects (player, enemies, etc.)
- **Traits**: Data components attached to entities (Transform, Health, Input, etc.)
- **Systems**: Functions that process entities with specific traits
- **World**: Container for all entities and global state

**Core Traits** (`src/traits/`):
- `Transform` - Position, rotation, scale
- `Health` - Current/max HP, damage state
- `Input` - Keyboard/mouse input state
- `MovementMode` - Crawl/walk state and timers
- `Scream` - Scream attack state and charge
- `IsPlayer`, `IsDuogringo` - Marker traits for entity identification

**Systems** (`src/systems/`):
- `input-system` - Captures keyboard/mouse input
- `player-movement-mode` - Manages crawl/walk toggling and timers
- `baby-scream` - Handles scream attack logic
- `duogringo-system` - AI behavior for Duogringo enemy
- `health-system` - Damage, healing, and death
- `player-camera` - Third-person camera following

### 2. Physics Layer (Rapier)

Physics simulation is handled by Rapier, a high-performance physics engine. The physics layer is **separate** from the ECS layer but syncs with it.

**Rapier Components** (`src/components/physics/`):
- `PlayerPhysics` - Player movement with WASD + Space
  - Reads: `Input`, `Transform`, `MovementMode` traits
  - Controls: Rapier RigidBody for player
  - Syncs position back to ECS Transform
- `DuogringoPhysics` - AI-driven enemy movement
  - Reads: Player and Duogringo `Transform` traits
  - Controls: Rapier RigidBody for Duogringo
  - Syncs position back to ECS Transform
- `PhysicsGround` - Static ground collider

**Key Pattern: ECS ↔ Rapier Sync**
1. Physics components read ECS traits (Input, Transform, MovementMode)
2. Rapier calculates new positions/velocities
3. Physics components write back to ECS Transform
4. Renderers read ECS Transform to position meshes

### 3. Rendering Layer (React Three Fiber)

React components render the 3D scene based on ECS state.

**Renderer Components** (`src/components/`):
- `PlayerRenderer` - Renders baby model with animations
  - Queries: `IsPlayer`, `Transform`
  - Reads: `Input`, `MovementMode` for animation state
- `DuogringoRenderer` - Renders Duogringo model
  - Queries: `IsDuogringo`, `Transform`
  - Reads: `DuogringoAnimation`, `DuogringoPower`
- `ScreamEffect` - Visual scream rings
  - Queries: `IsPlayer`, `Transform`, `Scream`
  - Creates/animates ring meshes

**Pattern: Query → Read → Render**
```tsx
export function PlayerRenderer() {
  const player = useQueryFirst(IsPlayer, Transform); // Query for entity
  if (!player) return null;
  return <PlayerView entity={player} />; // Render with entity
}

function PlayerView({ entity }: { entity: Entity }) {
  useFrame(() => {
    const transform = entity.get(Transform); // Read trait
    const input = entity.get(Input);
    // Update visual state based on traits
  });

  return <primitive object={model} />; // Render mesh
}
```

### 4. UI Layer (React DOM)

UI components render outside the Canvas and poll ECS state.

**UI Components** (`src/components/`):
- `HealthUI` - Health bar display
- `ScreamUI` - Scream charge indicator
- `MovementModeUI` - Crawl/walk mode display
- `DamageEffect` - Red flash on damage
- `GameOverScreen` - Death/restart screen

## Game Loop Flow

```
useFrame (60fps) → {
  1. inputSystem(world)       // Capture input
  2. pollInput(world)          // Process input state
  3. playerThirdPersonCamera   // Update camera
  4. duogringoSystem           // AI behavior
  5. playerMovementMode        // Crawl/walk timers
  6. babyScreamSystem          // Scream logic
  7. healthSystem              // Damage/healing
  8. syncView(world)           // Sync 3D transforms
}

Rapier Physics (60fps, parallel) → {
  - PlayerPhysics reads Input/MovementMode
  - Calculates velocities and positions
  - Writes back to Transform traits
}

Renderers (60fps) → {
  - Read Transform, Animation state
  - Update meshes, animations
  - Render scene
}
```

## Key Patterns

### Pattern 1: Entity Factories

Factories create entities with initial traits in `src/factories/`:

```typescript
export function createPlayerEntity({ world }: Props): Entity {
  return world.spawn(
    IsPlayer,
    Transform({ position, rotation, scale }),
    MovementMode(),
    Input(),
    Health({ current: 100, max: 100 }),
    Scream()
  );
}
```

### Pattern 2: System Processing

Systems process entities with specific traits:

```typescript
export function healthSystem(world: World) {
  const time = world.get(Time);

  world.query(Health).updateEach(([health]) => {
    // Update health logic
    if (health.invulnerabilityTimer > 0) {
      health.invulnerabilityTimer -= time.delta;
    }
  });
}
```

### Pattern 3: Rapier ↔ ECS Sync

Physics components bridge Rapier and ECS:

```typescript
useFrame(() => {
  // READ from ECS
  const input = entity.get(Input);
  const transform = entity.get(Transform);

  // APPLY to Rapier
  rb.setLinvel({ x: velocity.x, y: vel.y, z: velocity.z });

  // READ from Rapier
  const pos = rb.translation();

  // WRITE to ECS
  transform.position.set(pos.x, pos.y, pos.z);
  entity.set(Transform, transform);
});
```

### Pattern 4: Reactive Rendering

Renderers use `useQueryFirst` for reactive entity queries:

```typescript
export function PlayerRenderer() {
  // Re-renders when entity spawns or traits change
  const player = useQueryFirst(IsPlayer, Transform, MovementMode);
  if (!player) return null;
  return <PlayerView entity={player} />;
}
```

## Configuration

Game constants are centralized in `src/game-config.ts`:

```typescript
export const GAME_CONFIG = {
  player: {
    health: 100,
    crawlSpeed: 1.0,
    walkSpeed: 1.5,
    crawlJumpForce: 10,
    walkJumpForce: 12,
    colliderRadius: 0.25,
    colliderHeight: 0.5,
  },
  duogringo: {
    health: 150,
    detectionRange: 15,
    attackRange: 0.5,
    baseDamage: 20,
    mass: 2,
  },
  // ... more config
};
```

## File Structure

```
src/
├── components/           # React Three Fiber renderers
│   ├── physics/         # Rapier physics components
│   ├── *-renderer.tsx   # 3D mesh renderers
│   └── *-ui.tsx         # DOM UI components
├── systems/             # ECS systems (game logic)
├── traits/              # ECS traits (data components)
├── factories/           # Entity creation functions
├── game-config.ts       # Centralized constants
├── types/               # TypeScript types and enums
├── frameloop.ts         # Main game loop
└── app.tsx              # Root component
```

## Performance Considerations

1. **ECS Benefits**:
   - Data-oriented design for cache efficiency
   - Easy to add/remove features without coupling
   - System scheduler can prioritize critical systems

2. **Rapier Benefits**:
   - Native WASM physics engine (very fast)
   - Deterministic simulation
   - Built-in collision detection and resolution

3. **React Three Fiber Benefits**:
   - Declarative 3D scene management
   - Automatic cleanup and memory management
   - useFrame for 60fps updates

4. **Optimizations Applied**:
   - Removed 100ms polling in renderers → useFrame (60fps sync)
   - Centralized config to avoid prop drilling
   - Separated physics and rendering concerns
   - Used refs for values that don't need re-renders

## Adding New Features

### Adding a New Entity Type

1. Create marker trait in `src/traits/`
2. Create factory in `src/factories/`
3. Create renderer in `src/components/`
4. (Optional) Create physics component in `src/components/physics/`
5. (Optional) Create system for behavior in `src/systems/`

### Adding a New Player Ability

1. Add trait for ability state (e.g., `Dash`)
2. Add input handling in `input-system`
3. Add system to process ability logic
4. Add visual effect renderer
5. Add UI component for feedback

### Modifying Physics Behavior

1. Update `src/components/physics/player-physics.tsx` or `duogringo-physics.tsx`
2. Adjust RigidBody properties (mass, damping, etc.)
3. Tune values in `game-config.ts`

## Common Issues

**Issue**: Entity not rendering
- **Fix**: Check if entity has required traits (usually `Transform`)
- **Fix**: Verify renderer is querying correct traits

**Issue**: Physics not working
- **Fix**: Ensure entity has Rapier RigidBody component
- **Fix**: Check if `<Physics>` provider wraps components

**Issue**: State not updating
- **Fix**: Make sure to call `entity.set(Trait, newValue)` after mutation
- **Fix**: Check if system is running in frameloop

**Issue**: Jittery movement
- **Fix**: Use `setLinvel()` instead of `applyImpulse()` for direct control
- **Fix**: Ensure Transform is synced from Rapier every frame

## Future Improvements

- Add more enemy types with unique behaviors
- Implement vehicle physics with Rapier
- Add multiplayer support (deterministic physics helps)
- Create level editor
- Add save/load system
- Implement more player abilities
- Add particle effects for polish
- Optimize with object pooling for projectiles

## Resources

- [Koota ECS Docs](https://github.com/pmndrs/koota)
- [React Three Fiber Docs](https://docs.pmnd.rs/react-three-fiber)
- [Rapier Physics Docs](https://rapier.rs/)
- [Three.js Docs](https://threejs.org/docs/)
