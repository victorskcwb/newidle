import { Application, TextureStyle } from 'pixi.js';
import { useEffect, useRef } from 'react';
import type { Appearance } from '../../net/api.ts';
import { Hero } from '../../scene/hero.ts';

const W = 64;
const H = 48;

/** Animated hero preview for character creation (idle loop, live appearance changes). */
export function HeroPreview({ appearance }: { appearance: Appearance }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<Hero | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const app = new Application();
    let disposed = false;
    TextureStyle.defaultOptions.scaleMode = 'nearest';
    void app
      .init({
        width: W,
        height: H,
        resolution: 4,
        autoDensity: true,
        backgroundAlpha: 0,
        antialias: false,
      })
      .then(() => {
        if (disposed) {
          app.destroy(true);
          return;
        }
        host.appendChild(app.canvas);
        const hero = new Hero(appearance);
        hero.position.set(W / 2, H - 6);
        hero.idle(Date.now());
        app.stage.addChild(hero);
        heroRef.current = hero;
        app.ticker.add(() => hero.update(Date.now()));
      });
    return () => {
      disposed = true;
      heroRef.current = null;
      if (app.renderer) app.destroy(true, { children: true });
    };
    // The hero is created once; appearance changes go through setAppearance below.
  }, []);

  useEffect(() => {
    heroRef.current?.setAppearance(appearance);
  }, [appearance]);

  return <div ref={hostRef} className="hero-preview" aria-hidden />;
}
