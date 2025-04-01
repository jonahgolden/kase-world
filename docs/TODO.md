To Do List

- Remove unnecessary / unused trait properties
  - Collider: friction, restitution
    - What about offset?
  - PhysicsBody: isGrounded, groundNormal, lastGroundedTime
  - Movement: damping
- Allow the mouse to move up and down as well, so the user can look all around
- Add scope/target where baby is facing
- Allow for multiple successive jumps
- Make "s" key move backwards
- Allow for movement inputs while in the air
- OrbitControls?
- Update physics when swimming

Factories

- Creating specific power-up types (health bonus, etc.)
- Creating specific vehicle types (car, bike, etc.)
- Adding NPC-specific behaviors and AI traits
- Adding visual and audio feedback systems
- Implementing spawn management systems

Cleanup

- remove `any` types

To Revisit

- Controls
  - is mouse necessary?

Performance

- Spatial Partitioning Optimization DONE
  - The game already uses spatial hashing (seen in updateSpatialHashing system), but it can be optimized further
  - Currently, the grid is cleared and rebuilt every frame
  - Recommendation: Implement a dirty flag system where only moved entities trigger spatial hash updates
  - This would significantly reduce collision detection overhead for static objects
- System Execution Frequency Management DONE
  - Not all systems need to run every frame
  - Implement a tiered update system:
    - Critical systems (physics, input) run every frame
    - Medium priority systems (health, effects) run every other frame
    - Low priority systems (UI updates, non-critical effects) run at 1/4 or 1/3 frequency
  - This can be implemented by adding a timing check in the frameloop.ts
- Object Pooling for Frequent Spawns/Destroys
  - Currently, objects like scream effects are created and destroyed frequently
  - Implement an object pool system for:
    - Particle effects
    - Projectiles
    - Temporary visual effects
  - This will reduce garbage collection pauses and memory allocation overhead
- Vector/Math Object Reuse
  - While some systems already reuse vectors (like in physics-system.ts), many still create new THREE.Vector3 instances
  - Create a shared pool of reusable math objects
  - Focus areas:
    - Camera system (multiple vector/quaternion creations)
    - Collision response calculations
    - Transform updates
- Render Optimization
  - Implement frustum culling for objects
  - Add LOD (Level of Detail) system for complex meshes
  - Batch similar materials together
  - Use instancing for repeated geometries
  - Optimize the ScreamEffect component which currently creates new geometries frequently
