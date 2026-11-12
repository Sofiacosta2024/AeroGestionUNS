import { requireAdminPage } from '../../require-admin';
import OccupancyDashboard from './occupancy-dashboard';

export const dynamic = 'force-dynamic';

export default async function OccupancyPage() {
  await requireAdminPage();
  return <OccupancyDashboard />;
}
