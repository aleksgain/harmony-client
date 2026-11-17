import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSelectedHub } from '../../store/hubStore';
import type { Hub } from '../../types/harmony';
import { EmptyState } from './EmptyState';

export function RequireHub({ children }: { children: (hub: Hub) => ReactNode }): JSX.Element {
  const hub = useSelectedHub();
  if (!hub) {
    return (
      <EmptyState
        title="No hub selected"
        action={
          <Link className="text-accent hover:underline" to="/hubs">
            Find a hub →
          </Link>
        }
      >
        Discover or add a hub first.
      </EmptyState>
    );
  }
  return <>{children(hub)}</>;
}
