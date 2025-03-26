import { World } from 'koota';
import { Ref, Transform } from '../traits';

export function syncView(world: World) {
	world.query(Transform, Ref).updateEach(([transform, view]) => {
		view.position.copy(transform.position);
		view.rotation.copy(transform.rotation);
		view.scale.copy(transform.scale);
	});
}
