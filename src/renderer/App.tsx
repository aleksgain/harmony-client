import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Header } from './components/layout/Header';
import { NAV_ITEMS, Sidebar } from './components/layout/Sidebar';
import { UpdateBanner } from './components/layout/UpdateBanner';
import { Spinner } from './components/common/Button';
import { useHubEventsBridge } from './hooks/useHubDiscovery';
import { ActivitiesPage } from './pages/ActivitiesPage';
import { Dashboard } from './pages/Dashboard';
import { DevicesPage } from './pages/DevicesPage';
import { HubsPage } from './pages/HubsPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { SettingsPage } from './pages/SettingsPage';
import { useSettingsStore } from './store/settingsStore';

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/hubs': 'Hubs',
  '/devices': 'Devices',
  '/activities': 'Activities',
  '/settings': 'Settings',
};

const isMac = window.harmony.app.platform === 'darwin';
const MOD = isMac ? '⌘' : 'Ctrl+';

function useTheme(): void {
  const theme = useSettingsStore((s) => s.settings.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

/** Cmd/Ctrl+1..5 navigate, Cmd/Ctrl+, opens settings. */
function useGlobalShortcuts(): void {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod || e.altKey) return;
      const item = NAV_ITEMS.find((n) => n.key === e.key);
      if (item) {
        e.preventDefault();
        navigate(item.to);
      } else if (e.key === ',') {
        e.preventDefault();
        navigate('/settings');
      }
    };
    window.addEventListener('keydown', onKey);
    const offMenu = window.harmony.app.onNavigate((path) => navigate(path));
    return () => {
      window.removeEventListener('keydown', onKey);
      offMenu();
    };
  }, [navigate]);
}

export default function App(): JSX.Element {
  const { loaded, load, settings } = useSettingsStore();
  const location = useLocation();
  useHubEventsBridge();
  useTheme();
  useGlobalShortcuts();

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // No backend chosen yet → onboarding (settings stays reachable).
  if (!settings.backend && location.pathname !== '/settings') {
    return <OnboardingPage />;
  }

  return (
    <div className="flex h-full">
      <Sidebar modKey={MOD} />
      <div className="flex min-w-0 flex-1 flex-col">
        <UpdateBanner />
        <Header title={TITLES[location.pathname] ?? 'Harmony Revival'} />
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/hubs" element={<HubsPage />} />
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/activities" element={<ActivitiesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
