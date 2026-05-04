import { canUsePortalFeature, requireCurrentPortalPage } from '@/lib/portal/current-user';
import {
  listPortalCalendarEvents,
  listPortalCalendarUsers,
} from '@/lib/portal/calendar';
import { listPortalTasks } from '@/lib/portal/tasks';
import { PortalCalendarClient } from './portal-calendar-client';

export default async function PortalCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string; q?: string }>;
}) {
  const access = await requireCurrentPortalPage('calendar');
  const params = await searchParams;
  const [events, tasks, users] = await Promise.all([
    listPortalCalendarEvents({ start: params.start, end: params.end, query: params.q }),
    listPortalTasks(20),
    listPortalCalendarUsers(),
  ]);
  return (
    <PortalCalendarClient
      events={events.data}
      tasks={tasks}
      users={users.data}
      canCreate={canUsePortalFeature(access, 'calendar', 'create')}
      canInvite={canUsePortalFeature(access, 'calendar', 'comment')}
    />
  );
}
