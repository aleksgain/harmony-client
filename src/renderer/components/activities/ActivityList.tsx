import { useState } from 'react';
import { useLiveActivity } from '../../hooks/useLiveActivity';
import type { Activity, HarmonyConfig } from '../../types/harmony';
import { Button } from '../common/Button';
import { EmptyState, ErrorNote } from '../common/EmptyState';
import { ActivityCard } from './ActivityCard';
import { ActivityEditor } from './ActivityEditor';

export function ActivityList({
  hubId,
  config,
  connected,
}: {
  hubId: string;
  config: HarmonyConfig;
  connected: boolean;
}): JSX.Element {
  const live = useLiveActivity(hubId, connected);
  const [editing, setEditing] = useState<Activity | 'new' | null>(null);
  const [error, setError] = useState<unknown>(null);
  // Activity "-1" is PowerOff; the hub includes it in the config list.
  const activities = config.activity.filter((a) => a.id !== '-1');

  const start = (id: string): void => {
    setError(null);
    live.start(id).catch(setError);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <Button
          variant="danger"
          disabled={!connected || live.isOff}
          onClick={() => void live.powerOff().catch(setError)}
        >
          Power off all
        </Button>
        <Button
          variant="primary"
          onClick={() => setEditing('new')}
          disabled={config.device.length === 0}
        >
          New activity
        </Button>
      </div>
      <ErrorNote error={error} />
      {activities.length === 0 ? (
        <EmptyState title="No activities">
          {config.device.length === 0
            ? 'Add devices first, then create an activity.'
            : 'Create one like “Watch TV”.'}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {activities.map((a) => (
            <ActivityCard
              key={a.id}
              activity={a}
              devices={config.device}
              running={live.activityId === a.id}
              canStart={connected && !a.id.startsWith('act-')}
              onStart={() => start(a.id)}
              onEdit={() => setEditing(a)}
            />
          ))}
        </div>
      )}
      {editing && (
        <ActivityEditor
          hubId={hubId}
          activity={editing === 'new' ? null : editing}
          devices={config.device}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
