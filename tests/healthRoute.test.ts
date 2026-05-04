import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const getServerEnvMock = vi.fn();
const getRuntimeMetadataMock = vi.fn(() => ({
  appEnv: 'development',
  release: 'sha-test',
  siteUrl: 'http://localhost:3000',
}));
const logServerFailureMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@/lib/env.server', () => ({
  getServerEnv: getServerEnvMock,
  getRuntimeMetadata: getRuntimeMetadataMock,
}));

vi.mock('@/lib/monitoring', () => ({
  logServerFailure: logServerFailureMock,
}));

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerEnvMock.mockReturnValue({});
    createAdminClientMock.mockReturnValue({
      storage: {
        listBuckets: vi.fn().mockResolvedValue({
          data: [{ id: 'financial-evidence' }],
          error: null,
        }),
      },
    });
  });

  it('returns ok when env and database checks pass', async () => {
    createClientMock.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: '2026-04-01T00:00:00Z',
        error: null,
      }),
    });

    const { GET } = await import('@/app/api/health/route');
    const response = await GET(
      new Request('http://localhost:3000/api/health', {
        headers: { 'x-request-id': 'req-123' },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: 'ok',
      checks: { env: 'ok', database: 'ok', storage: 'ok' },
      requestId: 'req-123',
      release: 'sha-test',
    });
  });

  it('returns 503 when the database check fails', async () => {
    createClientMock.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'db unavailable' },
      }),
    });

    const { GET } = await import('@/app/api/health/route');
    const response = await GET(new Request('http://localhost:3000/api/health'));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      status: 'error',
      checks: { env: 'ok', database: 'error', storage: 'unknown' },
      message: 'db unavailable',
    });
  });

  it('returns 500 when env validation throws', async () => {
    getServerEnvMock.mockImplementation(() => {
      throw new Error('missing env');
    });

    const { GET } = await import('@/app/api/health/route');
    const response = await GET(new Request('http://localhost:3000/api/health'));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toMatchObject({
      status: 'error',
      checks: { env: 'error', database: 'unknown', storage: 'unknown' },
      message: 'missing env',
    });
    expect(logServerFailureMock).toHaveBeenCalled();
  });
});
