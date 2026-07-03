import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Environment } from "@react-three/drei";
import * as THREE from "three";
import logoAsset from "@/assets/logo-orbit.glb.asset.json";

function LogoModel() {
  const { scene } = useGLTF(logoAsset.url);
  const modelRef = useRef<THREE.Group>(null);

  const cloned = useMemo(() => {
    const clone = scene.clone();
    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    clone.position.sub(center); // center the model at origin
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const mapped = materials.map((mat) => {
          const m = mat.clone();
          m.transparent = true;
          m.opacity = 0.9;
          if ("emissive" in m && "emissiveIntensity" in m) {
            const std = m as THREE.MeshStandardMaterial;
            std.emissive = new THREE.Color("#8fb3ff");
            std.emissiveIntensity = 0.8;
            std.metalness = 0.4;
            std.roughness = 0.35;
            std.color = new THREE.Color("#eaf1ff");
          }
          return m;
        });
        mesh.material = Array.isArray(mesh.material) ? mapped : mapped[0];
      }
    });
    return clone;
  }, [scene]);

  useFrame(({ clock }) => {
    if (modelRef.current) {
      modelRef.current.rotation.y = clock.getElapsedTime() * 0.25;
    }
  });

  return (
    <group ref={modelRef} scale={2.2} position={[0, 0, 0]}>
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
      <ambientLight intensity={1} />
      <directionalLight position={[4, 4, 6]} intensity={2} color="#ffffff" />
      <directionalLight position={[-4, 2, -4]} intensity={1.2} color="#c8d8ff" />
      <pointLight position={[0, 0, 3]} intensity={1.2} color="#ffffff" />
    </>
  );
}

function Scene() {
  return (
    <>
      <Lighting />
      <Environment preset="city" />
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
