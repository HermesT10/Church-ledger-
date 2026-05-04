import { describe, expect, it } from 'vitest';
import { deriveProductEventFromPath } from '@/lib/analytics/utils';

describe('deriveProductEventFromPath', () => {
  it('classifies report routes as report views', () => {
    expect(deriveProductEventFromPath('/reports/monthly-dashboard')).toEqual({
      eventType: 'report_view',
      moduleKey: 'monthly-dashboard',
      path: '/reports/monthly-dashboard',
      metadata: {
        reportKey: 'monthly-dashboard',
      },
    });
  });

  it('classifies diagnostics separately from generic settings views', () => {
    expect(deriveProductEventFromPath('/settings/diagnostics')).toEqual({
      eventType: 'diagnostics_view',
      moduleKey: 'settings-diagnostics',
      path: '/settings/diagnostics',
    });
  });

  it('classifies ordinary workspace routes as module views', () => {
    expect(deriveProductEventFromPath('/banking/123/import')).toEqual({
      eventType: 'module_view',
      moduleKey: 'banking',
      path: '/banking/123/import',
    });
  });
});
