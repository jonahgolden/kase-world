# Baby Crawler Game: Core Systems Implementation Plan

This document outlines the implementation plan for six core systems that will serve as the foundation for the Baby Crawler game. By implementing these systems upfront, we'll establish a solid architecture that supports all future user stories without requiring significant refactoring.

## Implementation Order & Dependencies

We'll implement the systems in the following order to manage dependencies appropriately:

1. **Collision Detection System**

   - Foundation for physical interactions between all game entities
   - Required for: terrain interaction, damage detection, trigger events

2. **Physics and Movement System**

   - Builds on collision system for movement with physical constraints
   - Required for: character movement, object physics, vehicle dynamics

3. **Entity Factory System**

   - Standardizes entity creation with appropriate trait combinations
   - Required for: consistent entity spawning, presets for different entity types

4. **Health and Damage System**

   - Manages entity health, damage application, and death
   - Required for: baby health, NPC damage, power-up effects

5. **Interaction System**

   - Handles user-initiated interactions between entities
   - Required for: power-up collection, vehicle entry/exit, object interaction

6. **Ability System**
   - Manages special abilities like the baby's scream
   - Required for: scream attack, special moves, power-up usage

## Detailed Implementation Plans

### 1. Collision Detection System

#### Core Components:

- **Collider Trait**: Defines collision shapes and properties
- **SpatialHash**: Efficiently finds potential collision pairs
- **CollisionResolver**: Handles collision responses
- **CollisionEvents**: Notifies systems of collision events

#### Implementation Steps:

1. Create `ColliderType` enum with SPHERE, BOX, and CAPSULE types
2. Implement `Collider` trait with shape properties and collision filtering
3. Create `SpatialHashGrid` utility for broadphase collision detection
4. Implement `collisionSystem` that runs each frame to detect and resolve collisions
5. Add `CollisionEvents` trait for handling collision callbacks
6. Create utility functions for collision detection between different shape types

#### Key Considerations:

- Design collision layers for filtering interactions (terrain, characters, projectiles, etc.)
- Implement efficient broadphase and narrowphase collision detection
- Consider using a continuous collision detection approach for fast-moving objects
- Ensure collision system can handle both physical collisions and trigger-only interactions

### 2. Physics and Movement System

#### Core Components:

- **PhysicsBody** trait: Defines physical properties
- **Velocity** trait: Stores and applies movement vectors
- **physicsSystem**: Updates positions based on physics

#### Implementation Steps:

1. Enhance the existing `Velocity` trait (if necessary)
2. Implement `PhysicsBody` trait with mass, drag, and constraints
3. Create `physicsSystem` that applies forces, calculates velocity, and updates transforms
4. Implement gravity and basic physics forces
5. Add support for kinematic bodies (moved by code rather than physics)
6. Integrate with collision system for movement constraints

#### Key Considerations:

- Use delta time consistently for frame-rate independent physics
- Implement constraints to prevent objects from moving through colliders
- Consider different movement modes (ground-based, flying, etc.)
- Add support for jumping or vertical movement

### 3. Entity Factory System

#### Core Components:

- **createEntityFactory**: Factory function generator
- Entity-specific creator functions
- Standard entity configurations

#### Implementation Steps:

1. Create base `createEntityFactory` function to generate factory methods
2. Implement generic entity creators (`createBasicEntity`, `createPhysicsEntity`)
3. Add specific entity creators for the player character (expanding existing implementation)
4. Create skeleton functions for NPCs, power-ups, and vehicles
5. Document required traits for each entity type

#### Key Considerations:

- Use consistent naming conventions for all factory functions
- Ensure proper trait initialization for all created entities
- Design for extensibility to easily add new entity types
- Consider implementing an entity configuration system for easy property adjustment

### 4. Health and Damage System

#### Core Components:

- **Health** trait: Stores health state and callbacks
- **DamageEffect** trait: Handles effects like poison, healing over time
- **healthSystem**: Updates health and processes effects

#### Implementation Steps:

1. Implement `Health` trait with current/max values and callbacks
2. Create `DamageEffect` trait for temporary effects
3. Implement `healthSystem` to process health changes and effects
4. Add utility functions for applying damage and healing
5. Implement death handling and callbacks
6. Create visual feedback for health changes

#### Key Considerations:

- Support different damage types and resistances
- Implement invulnerability frames after taking damage
- Add support for healing and regeneration
- Ensure proper cleanup of entities on death

### 5. Interaction System

#### Core Components:

- **Interactable** trait: Makes entities interactable
- **Interactive** trait: Allows entities to interact
- **interactionSystem**: Detects and processes interactions

#### Implementation Steps:

1. Implement `Interactable` trait with interaction type and callbacks
2. Create `Interactive` trait for entities that can initiate interactions
3. Implement `interactionSystem` to detect potential interactions
4. Add input handling for triggering interactions
5. Create visual feedback for available interactions
6. Implement specific interaction handlers (enter vehicle, collect power-up)

#### Key Considerations:

- Design a flexible interaction system that can handle various interaction types
- Ensure proper feedback to the player about available interactions
- Support for context-sensitive interactions
- Consider interaction priorities for overlapping interactables

### 6. Ability System

#### Core Components:

- **Ability** trait: Defines ability properties and behavior
- **AbilityUser** trait: Manages ability usage and cooldowns
- **abilitySystem**: Processes ability activation and effects

#### Implementation Steps:

1. Implement `Ability` trait with cooldown, duration, and callbacks
2. Create `AbilityUser` trait to track available abilities and cooldowns
3. Implement `abilitySystem` to process ability activations and updates
4. Create specialized abilities (scream, dash, etc.)
5. Add visual feedback for ability usage and cooldowns
6. Implement ability targeting system (for directional abilities like scream)

#### Key Considerations:

- Support different ability types (instant, channeled, targeted)
- Implement proper cooldown tracking and visualization
- Consider ability resource costs (if applicable)
- Design for easy addition of new abilities

## Integration Guidelines

1. **System Registration**:

   - Register all systems in `frameloop.ts` in the appropriate order
   - Consider creating system groups for better organization

2. **Trait Composition**:

   - Document required trait combinations for each entity type
   - Ensure factory functions add all necessary traits

3. **Event Communication**:

   - Use callbacks and events for communication between systems
   - Avoid direct dependencies between systems where possible

4. **World State Management**:
   - Use singleton traits for global state (time, game state, etc.)
   - Ensure systems properly handle world state changes

## Testing Strategy

1. **Unit Tests**:

   - Create tests for each core system function
   - Test edge cases for collision detection and physics

2. **Integration Tests**:

   - Test interactions between systems (e.g., collision leading to damage)
   - Verify proper event propagation

3. **Performance Tests**:
   - Benchmark collision detection with many entities
   - Profile system updates to identify bottlenecks

## Performance Considerations

1. **Spatial Optimization**:

   - Use spatial partitioning from the start to optimize collision detection
   - Consider spatial culling for systems that don't need to process off-screen entities

2. **Entity Pooling**:

   - Implement object pooling for frequently created/destroyed entities (projectiles, effects)
   - Avoid runtime allocations during gameplay

3. **System Scheduling**:

   - Run expensive systems at reduced frequency when appropriate
   - Consider implementing a "sleeping" mechanism for inactive entities

4. **Memory Management**:
   - Reuse math objects (vectors, matrices) to reduce garbage collection
   - Monitor memory usage, especially for large worlds

## Existing Code Refactoring and Future Story Integration

This section details how existing code will be refactored to work with the new systems and how future stories will integrate with these systems.

### 1. Collision Detection System Refactoring

**Current Implementation**:

- The baby collision system (`src/systems/baby-collision.ts`) uses basic floor checking and boundary enforcement
- No proper collision shapes or spatial partitioning
- Manual collision checking for the scream attack system

**Refactoring Plan**:

- Add a proper `Collider` trait to the baby entity
- Replace direct position clamping with physics-based collision responses
- Update the `babySpawn` function in `actions.ts` to include collider information

**Future Story Integration**:

- Story 2.1 (Basic World Environment) will use this system for terrain collisions
- Stories 3.1-3.3 (NPC implementation) will use the same colliders for character interactions
- Story 4.1 (Power-up System) will use trigger colliders for collection detection
- Story 5.1 (Vehicle Implementation) will use complex colliders for vehicle physics

### 2. Physics and Movement System Refactoring

**Current Implementation**:

- Basic movement in `baby-jump.ts` and related files
- Custom gravity and movement with no proper physics integration
- Movement mode system for walk/crawl that needs preservation

**Refactoring Plan**:

- Replace custom velocity application with the new physics system
- Enhance the `Movement` trait to work with `PhysicsBody`
- Preserve crawl/walk mechanics while integrating with physics-based movement

**Future Story Integration**:

- Stories 3.1-3.5 (NPC Implementation) will use the same physics for movement
- Story 5.1-5.2 (Vehicle Implementation) will rely heavily on physics for vehicle behavior
- Enhanced landscape features in 2.3 can include physics-based interactions

### 3. Entity Factory System Integration

**Current Implementation**:

- Entity creation happens directly in `actions.ts`
- No standardized approach to entity creation

**Refactoring Plan**:

- Move from direct entity creation to using factory functions
- Standardize entity creation with all required traits

**Future Story Integration**:

- Stories 3.1-3.3 (NPC Creation) will use the factory for consistent entity creation
- Story 4.1 (Power-up System) will define standard power-up factory methods
- Story 5.1 (Vehicle Implementation) will use the factory for vehicle creation

### 4. Health and Damage System Enhancement

**Current Implementation**:

- Basic health system in `health-system.ts`
- Simple damage application in `actions.ts`
- No support for damage types or temporary effects

**Refactoring Plan**:

- Enhance `Health` trait with damage types and resistances
- Add support for temporary effects (damage over time, healing over time)
- Integrate with the collision system for damage application

**Future Story Integration**:

- Story 3.5 (NPC Health and Damage) will use the same enhanced system
- Story 4.2 (Health Bonus Power-ups) will integrate with this system
- Game over screen in story 6.4 can hook into health system events

### 5. Interaction System Implementation

**Current Implementation**:

- No existing interaction system
- Would need to be built from scratch

**Implementation Strategy**:

- Create new traits for interaction capabilities
- Build a system for proximity detection and interaction handling

**Future Story Integration**:

- Story 4.1 (Power-up System) will use this for power-up collection
- Story 5.2 (Baby Vehicle Interaction) for entering/exiting vehicles
- Could be extended for NPC interactions in future updates

### 6. Ability System Enhancement

**Current Implementation**:

- Custom implementation for baby scream in `baby-scream.ts`
- No generalized ability framework

**Refactoring Plan**:

- Convert the scream implementation to use the ability system
- Refactor as a specific ability instance in a more general framework

**Future Story Integration**:

- NPC abilities in stories 3.1-3.3 could use this system
- Additional power-up effects in story 4.3 could be implemented as abilities
- Could support additional baby abilities in future updates

### Implementation Challenges and Considerations

1. **Backward Compatibility**:

   - Each system must be implemented while maintaining existing functionality
   - Incremental testing to ensure the baby's movement and actions still work correctly

2. **Performance Transitions**:

   - Monitor performance as systems are integrated
   - Implement optimizations early when adding more sophisticated systems

3. **Order of Implementation**:

   - Follow the dependency order outlined above
   - Start with collision and physics as they form the foundation
   - Implement other systems as stories require them

4. **Code Organization**:
   - Keep systems in separate files under the `src/systems` directory
   - Group related traits in the `src/traits` directory
   - Use feature folders if systems become complex

## Conclusion

By implementing these six core systems in the recommended order, we'll establish a solid foundation for the Baby Crawler game. This architecture will support all planned features while minimizing the need for refactoring as we progress through the user stories.

Each system should be implemented with extensibility in mind, allowing for easy addition of new entity types, abilities, and interactions as the game evolves. By carefully refactoring existing code to work with these new systems, we can maintain current functionality while building a more robust foundation for future development.
