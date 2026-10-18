import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../i18n.ts';

interface Pos {
  x: number;
  y: number;
}

const KEY = 'abismo.windows';

function loadPos(id: string): Pos | null {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Pos>;
    return all[id] ?? null;
  } catch {
    return null;
  }
}

function savePos(id: string, pos: Pos) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Pos>;
    all[id] = pos;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Private mode or blocked storage: the window just opens at its default place.
  }
}

/**
 * A small window over the map: drag it by the title bar, minimise it to the bar, close it.
 * Its place is remembered on this device. On phones it docks to the bottom instead.
 */
export function FloatWindow({
  id,
  title,
  icon,
  initial,
  width,
  onClose,
  actions,
  children,
  testId,
}: {
  id: string;
  title: string;
  icon?: ReactNode;
  /** Default position (px from the top left), used until the player moves it. */
  initial: Pos;
  width: number;
  onClose?: () => void;
  actions?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  const [pos, setPos] = useState<Pos>(() => loadPos(id) ?? initial);
  const [min, setMin] = useState(false);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const box = useRef<HTMLElement>(null);

  // Keep the window on screen when the viewport shrinks.
  useEffect(() => {
    const clamp = () =>
      setPos((p) => ({
        x: Math.max(0, Math.min(p.x, window.innerWidth - 120)),
        y: Math.max(56, Math.min(p.y, window.innerHeight - 40)),
      }));
    clamp();
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, []);

  return (
    <section
      ref={box}
      className={`float-win${min ? ' minimized' : ''}`}
      style={{ left: pos.x, top: pos.y, width }}
      aria-label={title}
      data-testid={testId}
    >
      <header
        className="float-head"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPos({
            x: Math.max(0, Math.min(e.clientX - drag.current.dx, window.innerWidth - 120)),
            y: Math.max(56, Math.min(e.clientY - drag.current.dy, window.innerHeight - 40)),
          });
        }}
        onPointerUp={() => {
          if (drag.current) savePos(id, pos);
          drag.current = null;
        }}
      >
        {icon}
        <span className="pixel float-title">{title}</span>
        {actions}
        <button
          type="button"
          className="float-btn"
          aria-label={min ? t('window.restore') : t('window.minimize')}
          onClick={() => setMin(!min)}
        >
          {min ? '▢' : '—'}
        </button>
        {onClose && (
          <button
            type="button"
            className="float-btn"
            aria-label={t('action.close')}
            onClick={onClose}
          >
            ✕
          </button>
        )}
      </header>
      {!min && <div className="float-body">{children}</div>}
    </section>
  );
}
