'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import { Suspense, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

function PreviewMesh({ previewUrl, format }: { previewUrl: string; format: 'stl' | 'glb' }) {
  const [object, setObject] = useState<THREE.Object3D | null>(null);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      const response = await fetch(previewUrl);
      const arrayBuffer = await response.arrayBuffer();

      if (disposed) return;

      if (format === 'stl') {
        const geometry = new STLLoader().parse(arrayBuffer);
        geometry.center();
        const material = new THREE.MeshStandardMaterial({
          color: '#f97316',
          metalness: 0.12,
          roughness: 0.4
        });
        setObject(new THREE.Mesh(geometry, material));
        return;
      }

      const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
      setObject(gltf.scene);
    };

    void load();
    return () => {
      disposed = true;
    };
  }, [previewUrl, format]);

  if (!object) return null;
  return <primitive object={object} />;
}

export function ProjectPreview({ previewUrl, format }: { previewUrl: string; format: 'stl' | 'glb' }) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'o') return;
      controlsRef.current?.reset();
      controlsRef.current?.update();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="h-screen w-full bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.65),transparent_32%),linear-gradient(rgba(15,23,42,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.035)_1px,transparent_1px)] bg-[length:auto,42px_42px,42px_42px]">
      <Canvas camera={{ position: [82, 66, 82], fov: 34 }} className="!h-full !w-full" gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={1} />
        <directionalLight intensity={1.4} position={[5, 8, 8]} />
        <Suspense fallback={null}>
          <Stage adjustCamera intensity={0.18} shadows={false}>
            <PreviewMesh format={format} previewUrl={previewUrl} />
          </Stage>
        </Suspense>
        <OrbitControls makeDefault enablePan={false} ref={controlsRef} />
      </Canvas>
    </div>
  );
}
