import { Icon } from './Icon.tsx';
import { ITEM_ICON_COLS, ITEM_ICON_FRAMES } from './itemIcons.generated.ts';

/**
 * A 16 px pixel-art icon from sprites/items.png (items, materials, potions), scaled by whole
 * steps so the pixels stay crisp. Falls back to the vector icon of the same name.
 */
export function PixelIcon({ name, size = 32 }: { name: string; size?: number }) {
  const frame = ITEM_ICON_FRAMES[name];
  if (frame === undefined) return <Icon name={name} size={size} />;
  const scale = size / 16;
  return (
    <span
      className="pixel-icon"
      aria-hidden
      style={{
        width: size,
        height: size,
        backgroundSize: `${ITEM_ICON_COLS * size}px auto`,
        backgroundPosition: `-${(frame % ITEM_ICON_COLS) * 16 * scale}px -${Math.floor(frame / ITEM_ICON_COLS) * 16 * scale}px`,
      }}
    />
  );
}
