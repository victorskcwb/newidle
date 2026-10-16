import { spriteManifestSchema } from '@abismo/content';
import { useEffect, useState } from 'react';
import { t } from '../../i18n.ts';
import { isValidHeroName } from '../appearance.ts';

export interface NewHeroChoice {
  name: string;
  appearance: { hair: number; outfit: number };
}

const CLASSES = [
  { id: 'warrior', resets: 0 },
  { id: 'huntress', resets: 5 },
  { id: 'sorcerer', resets: 10 },
] as const;

/** One frame of the CC0 sprite sheet, scaled 4× with crisp pixels (CSS sprite). */
function SheetFrame({ image, frame, size }: { image: string; frame: number; size: number }) {
  const cols = 12;
  const scale = 4;
  return (
    <span
      className="sheet-frame"
      style={{
        width: size * scale,
        height: size * scale,
        backgroundImage: `url(${image})`,
        backgroundSize: `${cols * size * scale}px auto`,
        backgroundPosition: `-${(frame % cols) * size * scale}px -${Math.floor(frame / cols) * size * scale}px`,
      }}
    />
  );
}

/** The hero's looks from the sprite manifest (the same frames the map uses). */
function useHeroLooks() {
  const [looks, setLooks] = useState<{ image: string; size: number; frames: number[] } | null>(
    null,
  );
  useEffect(() => {
    let live = true;
    void fetch('sprites/manifest.json')
      .then((r) => r.json())
      .then((raw: unknown) => {
        const atlas = spriteManifestSchema.parse(raw).atlases.hero;
        const frames = atlas?.sprites.warrior?.variants;
        if (live && atlas?.image && atlas.frameSize && frames) {
          setLooks({ image: atlas.image, size: atlas.frameSize, frames });
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return looks;
}

/** Name, simple appearance and class (only the Guerreiro until reset 5). */
export function CreateHeroScreen({ onCreate }: { onCreate: (hero: NewHeroChoice) => void }) {
  const [name, setName] = useState('');
  const [outfit, setOutfit] = useState(0);
  const looks = useHeroLooks();
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
            {(looks?.frames ?? [0, 1, 2, 3]).map((frame, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={outfit === i}
                aria-label={`${t('create.look')} ${i + 1}`}
                className={`look${outfit === i ? ' active' : ''}`}
                onClick={() => setOutfit(i)}
              >
                {looks && <SheetFrame image={looks.image} frame={frame} size={looks.size} />}
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
