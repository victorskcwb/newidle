import type { GameState } from '@abismo/engine';
import { t } from '../i18n.ts';
import { useUi, type Screen } from '../state/store.ts';
import { useSim } from './useSim.ts';

interface Tip {
  flag: string;
  when: (s: GameState) => boolean;
  /** Screen the tip's button opens, if any. */
  opens?: Screen | 'backpack';
}

/**
 * The first ten minutes (section 11.4) as one-time tips, shown in order when their moment
 * comes. Seen tips are stored as flags in the save. Only the elder's welcome blocks the game.
 */
const TIPS: Tip[] = [
  { flag: 'tip_intro', when: () => true },
  { flag: 'tip_stash', when: (s) => s.stash.length > 0, opens: 'backpack' },
  { flag: 'tip_skill', when: (s) => s.hero.unspentSkillPoints > 0, opens: 'skills' },
  { flag: 'tip_refine', when: (s) => (s.materials.fragment ?? 0n) >= 3n, opens: 'smith' },
  { flag: 'tip_offline', when: (s) => s.hero.level >= 5 },
  { flag: 'tip_altar', when: (s) => s.hero.level >= 8, opens: 'altar' },
];

export function Tips() {
  const sim = useSim();
  const { openScreen, openBackpack } = useUi();
  const s = sim.state;
  const tip = TIPS.find((x) => !s.flags.includes(x.flag) && x.when(s));
  if (!tip) return null;
  const done = () => sim.setFlag(tip.flag);

  if (tip.flag === 'tip_intro') {
    return (
      <div className="sheet-backdrop center">
        <section className="panel sheet tip-intro" data-testid="tip-intro">
          <h2 className="pixel">{t('tip.tip_intro.title')}</h2>
          <p>{t('tip.tip_intro', { name: s.hero.name })}</p>
          <button
            type="button"
            className="btn btn-primary wide"
            onClick={done}
            data-testid="tip-ok"
          >
            {t('tip.thanks')}
          </button>
        </section>
      </div>
    );
  }
  return (
    <aside className="panel tip" role="status" data-testid="tip">
      <p>{t(`tip.${tip.flag}`)}</p>
      <div className="row">
        {tip.opens && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              done();
              if (tip.opens === 'backpack') openBackpack(true);
              else openScreen(tip.opens!);
            }}
          >
            {t('tip.show')}
          </button>
        )}
        <button type="button" className="btn" onClick={done}>
          {t('tip.ok')}
        </button>
      </div>
    </aside>
  );
}
