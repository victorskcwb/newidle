import { useState } from 'react';
import { t } from '../../i18n.ts';
import { isValidHeroName } from '../appearance.ts';
import { HeroSprite } from '../SheetSprite.tsx';

export interface NewHeroChoice {
  name: string;
  appearance: { hair: number; outfit: number };
}

const CLASSES = [
  { id: 'warrior', resets: 0 },
  { id: 'huntress', resets: 5 },
  { id: 'sorcerer', resets: 10 },
] as const;

/** Name, simple appearance and class (only the Guerreiro until reset 5). */
export function CreateHeroScreen({ onCreate }: { onCreate: (hero: NewHeroChoice) => void }) {
  const [name, setName] = useState('');
  const [outfit, setOutfit] = useState(0);
  const trimmed = name.trim();
  const valid = isValidHeroName(trimmed);
  return (
    <main className="screen">
      <form
        className="panel screen-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onCreate({ name: trimmed, appearance: { hair: 0, outfit } });
        }}
      >
        <h1 className="pixel">{t('create.title')}</h1>
        <p className="muted">{t('create.intro')}</p>

        <label className="field">
          <span>{t('create.name')}</span>
          <input
            className="input"
            value={name}
            maxLength={16}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            aria-invalid={trimmed.length > 0 && !valid}
            data-testid="hero-name"
          />
          <small className={trimmed.length > 0 && !valid ? 'tone-bad' : 'muted'}>
            {t('create.nameRule')}
          </small>
        </label>

        <fieldset className="field">
          <legend>{t('create.look')}</legend>
          <div className="looks" role="radiogroup" aria-label={t('create.look')}>
            {[0, 1, 2, 3].map((i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={outfit === i}
                aria-label={`${t('create.look')} ${i + 1}`}
                className={`look${outfit === i ? ' active' : ''}`}
                onClick={() => setOutfit(i)}
              >
                <HeroSprite outfit={i} scale={2} />
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>{t('create.class')}</legend>
          <div className="classes">
            {CLASSES.map((c) => (
              <div
                key={c.id}
                className={`class-option${c.resets === 0 ? ' active' : ' locked'}`}
                aria-disabled={c.resets > 0}
              >
                <span className="pixel">{t(`class.${c.id}`)}</span>
                {c.resets > 0 && (
                  <small className="muted">🔒 {t('create.locked', { n: c.resets })}</small>
                )}
              </div>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          className="btn btn-primary wide"
          disabled={!valid}
          data-testid="create-hero"
        >
          {t('create.start')}
        </button>
      </form>
    </main>
  );
}
