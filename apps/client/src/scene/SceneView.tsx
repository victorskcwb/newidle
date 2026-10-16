import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import type { GameSim } from '../game/sim.ts';
import { GameScene } from './GameScene.ts';

/** Mounts the Phaser canvas full-screen behind the React HUD. */
export function SceneView({
  sim,
  mapId,
  eco,
  reducedMotion,
}: {
  sim: GameSim;
  mapId: string;
  /** Economy mode: 30 fps and no particles. */
  eco: boolean;
  reducedMotion: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      backgroundColor: '#0e0d12',
      pixelArt: true,
      roundPixels: true,
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      fps: { target: eco ? 30 : 60, limit: eco ? 30 : 0 },
      banner: false,
      scene: new GameScene(sim, mapId, { noParticles: eco || reducedMotion }),
    });
    return () => game.destroy(true);
  }, [sim, mapId, eco, reducedMotion]);

  return <div ref={host} className="scene" data-testid="scene" />;
}
