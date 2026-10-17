import { ICON_PATHS } from './icons.generated.ts';

/** An interface icon from game-icons.net (CC BY 3.0), drawn in the current text colour. */
export function Icon({
  name,
  size = 20,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden
      focusable="false"
    >
      <path d={d} fill="currentColor" />
    </svg>
  );
}

export function hasIcon(name: string) {
  return name in ICON_PATHS;
}
