import { useAirPodsAlerts } from './useAirPodsAlerts';

/** Shows the AirPods connected / disconnected / no-motion dialogs (see useAirPodsAlerts.ts). Renders nothing. */
export function AirPodsConnectionAlerts() {
  useAirPodsAlerts();
  return null;
}
