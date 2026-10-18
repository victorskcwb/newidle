import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../i18n.ts';
import { useWindows, type WinPos as Pos, type WindowId } from '../state/windows.ts';

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
  id: WindowId;
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
  // Placed by the player or a layout preset; the local copy follows drags smoothly.
  const stored = useWindows((w) => w.pos[id]);
  const move = useWindows((w) => w.move);
  const [pos, setPos] = useState<Pos>(() => stored ?? initial);
  useEffect(() => {
    if (stored && !drag.current) setPos(stored);
  }, [stored]);
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
          if (drag.current) move(id, pos);
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
