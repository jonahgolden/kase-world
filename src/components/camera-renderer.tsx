import { PerspectiveCamera } from '@react-three/drei';
import { Entity } from 'koota';
import { useQueryFirst } from 'koota/react';
import { ComponentRef, useCallback } from 'react';
import { IsCamera, Ref, Transform } from '../traits';

function CameraView({ entity }: { entity: Entity }) {
	const setInitial = useCallback(
		(camera: ComponentRef<typeof PerspectiveCamera> | null) => {
			if (!camera) return;
			entity.add(Ref(camera));
		},
		[entity]
	);

	return <PerspectiveCamera ref={setInitial} makeDefault />;
}

export function CameraRenderer() {
	const camera = useQueryFirst(IsCamera, Transform);
	if (!camera) return null;
	return <CameraView entity={camera} />;
}
