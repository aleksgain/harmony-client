import { useState, useEffect } from 'react';

export default function TitleBar() {
  const [version, setVersion] = useState('');
  useEffect(() => {
    window.harmony.app.getVersion().then(setVersion).catch(() => {});
  }, []);

  const isMac = window.harmony.app.platform === 'darwin';

  return (
    <header
      className={`drag-region flex items-center h-10 px-4 border-b border-default bg-surface shrink-0 ${
        isMac ? 'pl-20' : ''
      }`}
    >
      <span className="text-sm font-medium no-drag select-none flex items-center gap-2">
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4 text-accent"
          fill="currentColor"
        >
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
        </svg>
        Harmony Revival
        {version && (
          <span className="text-xs text-muted">v{version}</span>
        )}
      </span>
    </header>
  );
}
