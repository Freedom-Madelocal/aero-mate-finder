import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import logoAsset from "@/assets/logo-orbit.glb.asset.json";

function LogoModel() {
  const { scene } = useGLTF(logoAsset.url);
  const modelRef = useRef<THREE.Group>(null);

  const cloned = useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mesh.material = materials.map((mat) => {
          const m = mat.clone();
          m.transparent = true;
          m.opacity = 0.9;
          return m;
        });
        if (!Array.isArray(mesh.material)) {
          mesh.material = mesh.material[0];
        }
      }
    });
    return clone;
  }, [scene]);

  useFrame(({ clock }) => {
    if (modelRef.current) {
      modelRef.current.rotation.y = clock.getElapsedTime() * 0.15;
      modelRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.05) * 0.05;
    }
  });

  return (
    <group ref={modelRef} scale={1.8} position={[0.2, 0, 0]}>
      <primitive object={cloned} />
    </group>
  );
}

function Lighting() {
  const { scene } = useThree();

  useEffect(() => {
    scene.background = null;
  }, [scene]);

  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[4, 4, 6]} intensity={2} color="#ffffff" />
      <directionalLight position={[-4, 2, -4]} intensity={1} color="#aaccff" />
      <pointLight position={[0, 0, 3]} intensity={1.5} color="#ffffff" />
    </>
  );
}

function Scene() {
  return (
    <>
      <Lighting />
      <LogoModel />
    </>
  );
}

export default function LoginLogo3D() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 45 }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}
        dpr={[1, 1.5]}
      >
        <Scene />
      </Canvas>
    </div>
  );
}

useGLTF.preload(logoAsset.url);

