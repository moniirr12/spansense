import { useEffect, useState } from 'react';

// Same convention as the rest of spanSense: localStorage 'nightMode' ('on'/'off'),
// defaulting to dark unless the system explicitly prefers light.
export function useNightMode() {
  const [night, setNight] = useState(() => {
    const saved = localStorage.getItem('nightMode');
    const systemPrefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    return saved === 'on' || (saved === null && !systemPrefersLight);
  });

  useEffect(() => {
    document.documentElement.classList.remove('nm-preload');
    document.body.classList.toggle('night-mode', night);
  }, [night]);

  function toggle() {
    setNight(prev => {
      const next = !prev;
      localStorage.setItem('nightMode', next ? 'on' : 'off');
      return next;
    });
  }

  return [night, toggle];
}
