import { useState } from 'react';
import { Button } from '../components/common/Button';
import { HubList } from '../components/hubs/HubList';
import { HubSetupWizard } from '../components/hubs/HubSetupWizard';
import { UsbProvisionPanel } from '../components/hubs/UsbProvisionPanel';
import type { Hub } from '../types/harmony';

export function HubsPage(): JSX.Element {
  const [wizard, setWizard] = useState<{ hub?: Hub } | null>(null);
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setWizard({})}>
          Set up a hub…
        </Button>
      </div>
      <HubList onClaim={(hub) => setWizard({ hub })} />
      <UsbProvisionPanel />
      {wizard && <HubSetupWizard initialHub={wizard.hub} onClose={() => setWizard(null)} />}
    </div>
  );
}
