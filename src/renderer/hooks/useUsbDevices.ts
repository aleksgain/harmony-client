import { useMutation, useQuery } from '@tanstack/react-query';
import type { ProvisionParams, UsbIdentifyResult } from '../types/harmony';

export function useUsbDevices(enabled: boolean) {
  return useQuery({
    queryKey: ['usbDevices'],
    queryFn: () => window.harmony.usb.listDevices(),
    enabled,
    refetchInterval: enabled ? 3_000 : false, // cheap enumeration; acts as hot-plug detection
    retry: false,
  });
}

export function useUsbIdentify() {
  return useMutation<UsbIdentifyResult, Error, string>({
    mutationFn: (path) => window.harmony.usb.identify(path),
  });
}

export function useUsbProvision() {
  return useMutation({
    mutationFn: ({ path, params }: { path: string; params: ProvisionParams }) =>
      window.harmony.usb.provision(path, params),
  });
}
