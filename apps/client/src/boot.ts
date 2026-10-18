/** Drives the loading screen of index.html: a step text, a progress bar, then fade away. */
export function bootStep(text: string, pct: number) {
  const step = document.getElementById('boot-step');
  const bar = document.getElementById('boot-progress');
  if (step) step.textContent = text;
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

export function bootDone() {
  const boot = document.getElementById('boot');
  if (!boot || boot.classList.contains('done')) return;
  bootStep('', 100);
  boot.classList.add('done');
  window.setTimeout(() => boot.remove(), 500);
}
