import { useState } from 'react';
import { t } from '../../i18n.ts';
import { HAIR_COLORS, OUTFIT_COLORS, cssColor, isValidHeroName } from '../appearance.ts';

export interface NewHeroChoice {
  name: string;
  appearance: { hair: number; outfit: number };
}

const CLASSES = [
  { id: 'warrior', resets: 0 },
  { id: 'huntress', resets: 5 },
  { id: 'sorcerer', resets: 10 },
] as const;

function Swatches({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: readonly number[];
  value: number;
  onChange: (i: number) => void;
}) {
  return (
    <fieldset className="field">
      <legend>{label}</legend>
      <div className="swatches" role="radiogroup" aria-label={label}>
        {colors.map((c, i) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${label} ${i + 1}`}
            className={`swatch${value === i ? ' active' : ''}`}
            style={{ background: cssColor(c) }}
            onClick={() => onChange(i)}
          />
        ))}
      </div>
    </fieldset>
  );
}

/** Name, simple appearance and class (only the Guerreiro until reset 5). */
export function CreateHeroScreen({ onCreate }: { onCreate: (hero: NewHeroChoice) => void }) {
  const [name, setName] = useState('');
  const [hair, setHair] = useState(0);
  const [outfit, setOutfit] = useState(0);
  const trimmed = name.trim();
  const valid = isValidHeroName(trimmed);
  return (
    <main className="screen">
      <form
        className="panel screen-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onCreate({ name: trimmed, appearance: { hair, outfit } });
        }}
      >
        <h1 className="pixel">{t('create.title')}</h1>
        <p className="muted">{t('create.intro')}</p>

        <div className="hero-preview" aria-hidden>
          <div className="preview-head" style={{ borderTopColor: cssColor(HAIR_COLORS[hair]!) }} />
          <div className="preview-body" style={{ background: cssColor(OUTFIT_COLORS[outfit]!) }} />
        </div>

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

        <Swatches label={t('create.hair')} colors={HAIR_COLORS} value={hair} onChange={setHair} />
        <Swatches
          label={t('create.outfit')}
          colors={OUTFIT_COLORS}
          value={outfit}
          onChange={setOutfit}
        />

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
