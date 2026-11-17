import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TitleBar from './TitleBar';
import UpdateBanner from '../common/UpdateBanner';
import { useSettingsInit } from '../../hooks/useSettingsInit';

export default function Layout() {
  useSettingsInit();
  return (
    <div className="flex flex-col h-full">
      <TitleBar />
      <UpdateBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
