"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";

// Landing hero only (and later, milestone celebrations). Never on the dashboard.
// A ring of coins slowly orbiting the twin, tilted toward the camera, with a little pointer parallax.

const COLORS = ["#f5c451", "#5ee6a8", "#f5c451", "#b9a0ff", "#f5c451", "#5ee6a8", "#f5c451", "#7cc8ff", "#f5c451"];

function Coin({ index, total }: { index: number; total: number }) {
  const ref = useRef<Mesh>(null);
  const angle = (index / total) * Math.PI * 2;
  const radius = 1.85 + (index % 3) * 0.22;
  const spin = 0.6 + (index % 4) * 0.25;
  const bob = index * 1.7;

  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime;
    m.rotation.x = Math.PI / 2 + Math.sin(t * 0.8 + bob) * 0.3;
    m.rotation.z = t * spin;
    m.position.y = Math.sin(t * 1.1 + bob) * 0.12;
  });

  return (
    <mesh ref={ref} position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]} scale={0.9 - (index % 3) * 0.12}>
      <cylinderGeometry args={[0.36, 0.36, 0.07, 40]} />
      <meshStandardMaterial color={COLORS[index % COLORS.length]} metalness={0.75} roughness={0.28} />
    </mesh>
  );
}

function Orbit() {
  const group = useRef<Group>(null);
  const coins = useMemo(() => Array.from({ length: 9 }, (_, i) => i), []);

  useFrame(({ clock, pointer }, delta) => {
    const g = group.current;
    if (!g) return;
    g.rotation.y += delta * 0.18;
    // Ease toward the pointer so the ring leans with the finger/mouse.
    g.rotation.x += (0.38 + pointer.y * 0.12 - g.rotation.x) * 0.05;
    g.rotation.z += (pointer.x * -0.1 - g.rotation.z) * 0.05;
    g.position.y = Math.sin(clock.elapsedTime * 0.6) * 0.05;
  });

  return (
    <group ref={group}>
      {coins.map((i) => (
        <Coin key={i} index={i} total={coins.length} />
      ))}
    </group>
  );
}

export default function CoinOrbit() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.6, 6.2], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      style={{ pointerEvents: "none" }}
      // The canvas sits behind the UI, so listen for the pointer on the whole page.
      eventSource={document.body}
      eventPrefix="client"
      aria-hidden
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 4, 5]} intensity={2.2} />
      <pointLight position={[-3, -1, 2]} intensity={12} color="#5ee6a8" />
      <Orbit />
    </Canvas>
  );
}
