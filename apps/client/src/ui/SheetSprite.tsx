import { spriteManifestSchema, type SpriteManifest } from '@abismo/content';
import { useEffect, useState } from 'react';
import { usePrefs } from '../state/prefs.ts';

let manifestPromise: Promise<SpriteManifest | null> | null = null;

/** The sprite manifest, fetched once for the interface (the scene loads its own copy). */
export function useManifest(): SpriteManifest | null {
  const [manifest, setManifest] = useState<SpriteManifest | null>(null);
  useEffect(() => {
    let live = true;
    manifestPromise ??= fetch('sprites/manifest.json')
      .then((r) => r.json())
      .then((raw: unknown) => spriteManifestSchema.parse(raw))
      .catch(() => null);
    void manifestPromise.then((m) => live && setManifest(m));
    return () => {
      live = false;
    };
  }, []);
  return manifest;
}

/**
 * A character from a sprite sheet as a CSS sprite with crisp pixels, cycling through its
 * frames (the same idle loop the map plays). Still when "reduce motion" is on.
 */
export function SheetSprite({
  image,
  frames,
  width,
  height,
  columns,
  scale = 3,
  frameMs = 160,
}: {
  image: string;
  frames: number[];
  width: number;
  height: number;
  columns: number;
  scale?: number;
  frameMs?: number;
}) {
  const reducedMotion = usePrefs((s) => s.reducedMotion);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reducedMotion || frames.length < 2) return;
    const id = window.setInterval(() => setI((k) => (k + 1) % frames.length), frameMs);
    return () => window.clearInterval(id);
  }, [frames.length, frameMs, reducedMotion]);
  const frame = frames[i % frames.length] ?? 0;
  return (
    <span
      className="sheet-frame"
      aria-hidden
      style={{
        width: width * scale,
        height: height * scale,
        backgroundImage: `url(${image})`,
        backgroundSize: `${columns * width * scale}px auto`,
        backgroundPosition: `-${(frame % columns) * width * scale}px -${Math.floor(frame / columns) * height * scale}px`,
      }}
    />
  );
}

/** The hero's animated look for an outfit, or nothing while the manifest loads. */
export function HeroSprite({
  outfit,
  scale = 3,
  classId = 'warrior',
}: {
  outfit: number;
  scale?: number;
  classId?: string;
}) {
  const manifest = useManifest();
  const atlas = manifest?.atlases.hero;
  const looks = (atlas?.sprites[classId] ?? atlas?.sprites.warrior)?.looks;
  if (!atlas?.image || !atlas.frameWidth || !looks) return null;
  const set = looks[outfit % looks.length]!;
  return (
    <SheetSprite
      image={atlas.image}
      frames={set.idle}
      width={atlas.frameWidth}
      height={atlas.frameHeight ?? atlas.frameWidth}
      columns={atlas.columns ?? 16}
      scale={scale}
    />
  );
}
