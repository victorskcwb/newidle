import type { Quest } from '@abismo/engine';
import { useState } from 'react';
import { formatNumber, t } from '../../i18n.ts';
import { Sheet, tryIntent } from '../Sheet.tsx';
import { useSim } from '../useSim.ts';

function rewardText(sim: ReturnType<typeof useSim>, reward: Record<string, number>) {
  return Object.entries(reward)
    .map(([id, qty]) => {
      const name =
        sim.content.materials.get(id)?.nameKey ?? sim.content.consumables.get(id)?.nameKey;
      return `${qty} ${name ? t(name) : id}`;
    })
    .join(', ');
}

function QuestRow({
  quest,
  onClaim,
  testId,
}: {
  quest: Quest;
  onClaim: () => void;
  testId: string;
}) {
  const sim = useSim();
  const done = quest.progress >= quest.target;
  const pct = Math.min(100, (quest.progress / quest.target) * 100);
  return (
    <div className="quest" data-testid={testId}>
      <div>
        <div>{t(`quest.${quest.kind}`, { n: formatNumber(quest.target) })}</div>
        <div className="bar bar-xp quest-bar">
          <div className="bar-fill" style={{ width: `${pct}%` }} />
          <span className="bar-text">
            {formatNumber(quest.progress)} / {formatNumber(quest.target)}
          </span>
        </div>
        <div className="muted small">
          {t('quests.reward', { reward: rewardText(sim, quest.reward) })}
        </div>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!done || quest.claimed}
        onClick={onClaim}
      >
        {quest.claimed ? t('quests.claimed') : t('quests.claim')}
      </button>
    </div>
  );
}

/** Daily and weekly goals (milestone 2): progress bars and rewards to claim. */
export function QuestsScreen() {
  const sim = useSim();
  const q = sim.state.quests;
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet title={t('screen.quests')} testId="quests">
      <h3 className="pixel">{t('quests.daily')}</h3>
      <p className="muted small">{t('quests.dailyHint')}</p>
      {q.daily.map((quest, i) => (
        <QuestRow
          key={i}
          quest={quest}
          testId={`quest-${i}`}
          onClaim={() => setError(tryIntent(() => sim.claimQuest(i)))}
        />
      ))}
      <h3 className="pixel">{t('quests.weekly')}</h3>
      {q.weekly && (
        <QuestRow
          quest={q.weekly}
          testId="quest-weekly"
          onClaim={() => setError(tryIntent(() => sim.claimQuest('weekly')))}
        />
      )}
      {error && <p className="tone-bad">{error}</p>}
    </Sheet>
  );
}
