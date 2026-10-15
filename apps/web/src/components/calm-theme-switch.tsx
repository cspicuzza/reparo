import { useEffect } from 'react';

/**
 * When the device switches between light and dark, every colour transition would fire at once
 * and the page would smear. This turns transitions off for that one frame (Workflow polish,
 * OD-81; the recipe from the better-ui skill: add an override, force a style flush, remove it
 * after the next paint).
 */
export function CalmThemeSwitch() {
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const style = document.createElement('style');
      style.append(document.createTextNode('*,*::before,*::after{transition:none !important}'));
      document.head.append(style);
      void document.body.offsetHeight; // forces the style flush while the override is in place
      requestAnimationFrame(() => requestAnimationFrame(() => style.remove()));
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return null;
}
