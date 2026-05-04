export interface ProductEventDescriptor {
  eventType: string;
  moduleKey: string;
  path: string;
  metadata?: Record<string, unknown>;
}

function normalizePath(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed) {
    return '/dashboard';
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function deriveProductEventFromPath(pathname: string): ProductEventDescriptor | null {
  const path = normalizePath(pathname);
  const [root, second] = path.split('/').filter(Boolean);

  if (!root) {
    return {
      eventType: 'module_view',
      moduleKey: 'dashboard',
      path: '/dashboard',
    };
  }

  if (root === 'reports') {
    return {
      eventType: 'report_view',
      moduleKey: second ?? 'reports',
      path,
      metadata: {
        reportKey: second ?? 'reports',
      },
    };
  }

  if (root === 'settings' && second === 'diagnostics') {
    return {
      eventType: 'diagnostics_view',
      moduleKey: 'settings-diagnostics',
      path,
    };
  }

  return {
    eventType: 'module_view',
    moduleKey: root,
    path,
  };
}
