import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import type { GameSim } from '../game/sim.ts';
import { GameScene } from './GameScene.ts';

/** Mounts the Phaser canvas full-screen behind the React HUD. */
export function SceneView({ sim, mapId }: { sim: GameSim; mapId: string }) {
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
      fps: { target: 60 },
      banner: false,
      scene: new GameScene(sim, mapId),
    });
    return () => game.destroy(true);
  }, [sim, mapId]);

  return <div ref={host} className="scene" data-testid="scene" />;
}
