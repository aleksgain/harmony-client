import { ActivityList } from '../components/activities/ActivityList';
import { Spinner } from '../components/common/Button';
import { ConfigToolbar } from '../components/common/ConfigToolbar';
import { RequireHub } from '../components/common/RequireHub';
import { useHubConfig } from '../hooks/useHubConfig';
import { useHubConnection } from '../hooks/useHubConnection';
import type { Hub } from '../types/harmony';

function ActivitiesForHub({ hub }: { hub: Hub }): JSX.Element {
  const { connected } = useHubConnection(hub.id);
  const cfg = useHubConfig(hub.id, connected);
  return (
    <div className="space-y-4">
      <ConfigToolbar hubId={hub.id} cfg={cfg} />
      {cfg.loading && !cfg.config ? (
        <Spinner />
      ) : (
        <ActivityList
          hubId={hub.id}
          config={cfg.config ?? { activity: [], device: [] }}
          connected={connected}
        />
      )}
    </div>
  );
}

export function ActivitiesPage(): JSX.Element {
  return <RequireHub>{(hub) => <ActivitiesForHub hub={hub} />}</RequireHub>;
}
