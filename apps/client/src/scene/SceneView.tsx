import type { SkillId } from '@valdren/content';
import { useEffect, useRef } from 'react';
import { formatXp, t } from '../i18n.ts';
import { sim, useGame } from '../state/store.ts';
import { GameScene } from './GameScene.ts';

export function SceneView() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let unsubscribe = () => {};
    const scene = new GameScene(sim.content, (tick) => sim.tickToMs(tick), {
      xpGain: (xp) => t('ui.xpGain', { xp: formatXp(xp) }),
      levelUp: (skill, level) => t('ui.levelUp', { skill: t(`skill.${skill as SkillId}`), level }),
    });
    void scene.mount(host).then(() => {
      if (disposed) {
        scene.destroy();
        return;
      }
      scene.sync(sim.state);
      const appearance = useGame.getState().profile?.appearance;
      if (appearance) scene.setAppearance(appearance);
      const unsubSim = sim.subscribe({
        onEvents: (events) => scene.push(events),
        onSummary: () => scene.sync(sim.state),
        onReset: (state) => scene.sync(state, true),
      });
      const unsubStore = useGame.subscribe((s, prev) => {
        if (s.profile && s.profile.appearance !== prev.profile?.appearance) {
          scene.setAppearance(s.profile.appearance);
        }
      });
      unsubscribe = () => {
        unsubSim();
        unsubStore();
      };
    });
    return () => {
      disposed = true;
      unsubscribe();
      if (scene.app.renderer) scene.destroy();
    };
  }, []);

  return <div ref={hostRef} className="scene" data-testid="scene" />;
}
