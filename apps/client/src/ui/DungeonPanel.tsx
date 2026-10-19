import {
  DUNGEON_FLOORS_PER_BLOCK,
  DUNGEON_FLOORS_PER_RESET_POINT,
  DUNGEON_KILLS_PER_FLOOR,
  DUNGEON_UNLOCK_BOSSES,
  dungeonStartFloor,
  dungeonUnlocked,
  floorBlock,
  floorScalePct,
} from '@abismo/engine';
import { useState } from 'react';
import { formatNumber, t } from '../i18n.ts';
import { useUi } from '../state/store.ts';
import { tryIntent } from './Sheet.tsx';
import { useSim } from './useSim.ts';

/** The endless dungeon in the Adventures screen: records, the next run, enter or leave. */
export function DungeonPanel() {
  const sim = useSim();
  const openScreen = useUi((u) => u.openScreen);
  const [error, setError] = useState<string | null>(null);
  const d = sim.state.dungeon;
  const unlocked = dungeonUnlocked(sim.state);
  const start = dungeonStartFloor(sim.state);
  const floor = d.active ? d.floor : start;
  const block = floorBlock(sim.content, floor);
  return (
    <div className="dungeon" data-testid="dungeon">
      <p className="muted small">
        {t('dungeon.intro', {
          kills: DUNGEON_KILLS_PER_FLOOR,
          block: DUNGEON_FLOORS_PER_BLOCK,
          perPoint: DUNGEON_FLOORS_PER_RESET_POINT,
        })}
      </p>
      <dl className="stat-table">
        <div>
          <dt>{t('dungeon.best')}</dt>
          <dd data-testid="dungeon-best">{formatNumber(d.best)}</dd>
        </div>
        <div>
          <dt>{t('dungeon.bestEver')}</dt>
          <dd>{formatNumber(d.bestEver)}</dd>
        </div>
        <div>
          <dt>{d.active ? t('dungeon.now') : t('dungeon.start')}</dt>
          <dd>
            {t('dungeon.floorOf', {
              floor,
              hunt: t(block.hunt.nameKey),
              pct: floorScalePct(sim.content, floor),
            })}
          </dd>
        </div>
      </dl>
      {!unlocked ? (
        <p className="tone-bad small">{t('dungeon.locked', { n: DUNGEON_UNLOCK_BOSSES })}</p>
      ) : d.active ? (
        <button
          type="button"
          className="btn wide"
          data-testid="dungeon-leave"
          onClick={() => setError(tryIntent(() => sim.returnToTown()))}
        >
          {t('dungeon.leave')}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary wide"
          data-testid="dungeon-enter"
          onClick={() => {
            const err = tryIntent(() => sim.enterDungeon());
            setError(err);
            if (!err) openScreen(null);
          }}
        >
          {t('dungeon.enter', { floor: start })}
        </button>
      )}
      {error && <p className="tone-bad">{error}</p>}
    </div>
  );
}
