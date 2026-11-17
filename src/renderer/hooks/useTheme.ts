import { useEffect } from 'react';
import type { Theme } from '../../shared/harmony';

const mq = window.matchMedia?.('(prefers-color-scheme: dark)');

function applyTheme(theme: Theme) {
  const dark =
    theme === 'dark' || (theme === 'system' && mq?.matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function useTheme(theme: Theme) {
  useEffect(() => {
    applyTheme(theme);
    if (theme === 'system' && mq) {
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);
}
