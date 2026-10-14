import { useState, type FormEvent } from 'react';
import { t } from '../../i18n.ts';
import { api, ApiError, type Appearance } from '../../net/api.ts';
import { HeroPreview } from '../components/HeroPreview.tsx';

const PALETTES: Record<keyof Appearance, number[]> = {
  skin: [0xf2d0b0, 0xe0b48a, 0xb9855b, 0x8a5a3a, 0x5c3a24],
  hair: [0x2a1d18, 0x4a2f22, 0x8a5a2a, 0xd9b26a, 0xb8b8c0, 0xa83a2a],
  outfit: [0x3f6db0, 0x6a2e3e, 0x3f7d43, 0x8a6a2a, 0x5b4a8a, 0x404048],
};

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Name and appearance, with an animated preview of the modular hero. */
export function CreateHeroScreen({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [appearance, setAppearance] = useState<Appearance>({
    skin: PALETTES.skin[1]!,
    hair: PALETTES.hair[1]!,
    outfit: PALETTES.outfit[0]!,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createCharacter(name.trim(), appearance);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.messageKey : 'error.internal');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <form className="card form" onSubmit={submit} noValidate>
        <h1 className="card-title">{t('hero.title')}</h1>
        <HeroPreview appearance={appearance} />
        <label className="field">
          <span>{t('hero.name')}</span>
          <input
            value={name}
            maxLength={12}
            autoComplete="nickname"
            required
            onChange={(e) => setName(e.target.value)}
          />
          <small className="muted">{t('hero.nameHint')}</small>
        </label>
        {(Object.keys(PALETTES) as (keyof Appearance)[]).map((part) => (
          <fieldset key={part} className="swatches">
            <legend>{t(`hero.${part}`)}</legend>
            {PALETTES[part].map((color, i) => (
              <button
                key={color}
                type="button"
                className="swatch"
                style={{ background: hex(color) }}
                aria-label={t('hero.swatch', { n: i + 1 })}
                aria-pressed={appearance[part] === color}
                onClick={() => setAppearance({ ...appearance, [part]: color })}
              />
            ))}
          </fieldset>
        ))}
        {error && (
          <p className="blocked" role="alert">
            {t(error)}
          </p>
        )}
        <button className="btn" type="submit" disabled={busy || name.trim().length < 3}>
          {t('hero.create')}
        </button>
      </form>
    </main>
  );
}
