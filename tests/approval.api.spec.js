import { expect, test } from '@playwright/test';

async function createRequest(request, fixture = 'standard') {
  const response = await request.post('/api/requests', {
    data: { title: 'Purchase request', fixture },
  });
  expect(response.status()).toBe(201);
  const record = await response.json();
  expect(record).toEqual({
    id: expect.any(Number),
    title: 'Purchase request',
    fixture,
    status: 'pending',
    approvedAt: null,
  });
  return `/api/requests/${record.id}`;
}

test('valid code approves a request and persists the timestamp', async ({ request }) => {
  const url = await createRequest(request);
  const response = await request.post(`${url}/approve`, { data: { code: '123456' } });
  expect(response.status()).toBe(200);
  const approved = await response.json();
  expect(approved.status).toBe('approved');
  expect(approved.approvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

  const reloaded = await request.get(url);
  expect(reloaded.status()).toBe(200);
  expect(await reloaded.json()).toEqual(approved);
});

test('accepts titles at the minimum and maximum lengths', async ({ request }) => {
  for (const title of ['A', 'T'.repeat(80)]) {
    const response = await request.post('/api/requests', {
      data: { title, fixture: 'standard' },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject({ title, status: 'pending' });
  }
});

test('rejects empty, whitespace-only, and overlong titles', async ({ request }) => {
  for (const title of ['', '   ', 'T'.repeat(81)]) {
    const response = await request.post('/api/requests', {
      data: { title, fixture: 'standard' },
    });

    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  }
});

test('rejects a wrong six-digit code without changing the request', async ({ request }) => {
  const url = await createRequest(request);
  const response = await request.post(`${url}/approve`, { data: { code: '999999' } });
  expect(response.status()).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: 'INCORRECT_CODE' } });
  expect(await (await request.get(url)).json()).toMatchObject({
    status: 'pending',
    approvedAt: null,
  });
});

test('rejects truncated and numeric codes', async ({ request }) => {
  const url = await createRequest(request, 'leading-zero');
  for (const code of ['42731', 42731, '042731\n', '０４２７３１']) {
    const response = await request.post(`${url}/approve`, { data: { code } });
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_CODE_FORMAT' } });
  }
  expect(await (await request.get(url)).json()).toMatchObject({
    status: 'pending',
    approvedAt: null,
  });
});

test('a leading zero remains part of a valid approval code @leading-zero', async ({ request }) => {
  const url = await createRequest(request, 'leading-zero');
  const response = await request.post(`${url}/approve`, { data: { code: '042731' } });
  expect(response.status(), await response.text()).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'approved' });
});

test('duplicate approval preserves the original timestamp', async ({ request }) => {
  const url = await createRequest(request);
  const options = { data: { code: '123456' } };
  const approved = await request.post(`${url}/approve`, options);
  expect(approved.status()).toBe(200);

  const replay = await request.post(`${url}/approve`, options);
  expect(replay.status()).toBe(409);
  expect(await replay.json()).toMatchObject({ error: { code: 'ALREADY_APPROVED' } });
  expect(await (await request.get(url)).json()).toEqual(await approved.json());
});

test('allows only one of two simultaneous approvals', async ({ request }) => {
  const url = await createRequest(request);
  const options = { data: { code: '123456' } };
  const responses = await Promise.all([
    request.post(`${url}/approve`, options),
    request.post(`${url}/approve`, options),
  ]);

  const approvedResponses = responses.filter(response => response.status() === 200);
  const conflictResponses = responses.filter(response => response.status() === 409);
  expect(approvedResponses).toHaveLength(1);
  expect(conflictResponses).toHaveLength(1);
  expect(await conflictResponses[0].json()).toMatchObject({
    error: { code: 'ALREADY_APPROVED' },
  });

  const approved = await approvedResponses[0].json();
  expect(approved).toMatchObject({ status: 'approved', approvedAt: expect.any(String) });
  expect(await (await request.get(url)).json()).toEqual(approved);
});
