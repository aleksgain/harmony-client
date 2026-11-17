import { Spinner } from '../components/common/Button';
import { ConfigToolbar } from '../components/common/ConfigToolbar';
import { RequireHub } from '../components/common/RequireHub';
import { DeviceList } from '../components/devices/DeviceList';
import { useHubConfig } from '../hooks/useHubConfig';
import { useHubConnection } from '../hooks/useHubConnection';
import type { Hub } from '../types/harmony';

function DevicesForHub({ hub }: { hub: Hub }): JSX.Element {
  const { connected } = useHubConnection(hub.id);
  const cfg = useHubConfig(hub.id, connected);
  return (
    <div className="space-y-4">
      <ConfigToolbar hubId={hub.id} cfg={cfg} />
      {cfg.loading && !cfg.config ? (
        <Spinner />
      ) : (
        <DeviceList hubId={hub.id} devices={cfg.config?.device ?? []} />
      )}
    </div>
  );
}

export function DevicesPage(): JSX.Element {
  return <RequireHub>{(hub) => <DevicesForHub hub={hub} />}</RequireHub>;
}
