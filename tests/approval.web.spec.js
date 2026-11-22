import { expect, test } from '@playwright/test';

async function createRequest(page, fixture = 'standard') {
  await page.goto('/');
  await page.getByLabel('Document title').fill('Purchase request');
  await page.getByLabel('Test fixture').selectOption(fixture);
  await page.getByRole('button', { name: 'Create request' }).click();
  await expect(page.getByRole('status')).toHaveText('Status: Pending');
}

async function submitCode(page, code) {
  await page.getByLabel('Approval code').fill(code);
  const approvalResponse = page.waitForResponse(
    response => response.request().method() === 'POST' && response.url().endsWith('/approve'),
  );
  await page.getByRole('button', { name: 'Approve document' }).click();
  return approvalResponse;
}

test('blocks an empty title in the form', async ({ page }) => {
  await page.goto('/');
  const titleInput = page.getByLabel('Document title');
  let createRequests = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/api/requests')) {
      createRequests += 1;
    }
  });

  await page.getByRole('button', { name: 'Create request' }).click();

  await expect(titleInput).toBeFocused();
  expect(await titleInput.evaluate(input => input.validity.valueMissing)).toBe(true);
  await expect(page.locator('#title-error')).toHaveText('Enter a document title.');
  expect(createRequests).toBe(0);
  await expect(page.locator('#request')).toBeHidden();
});

test('creates a request with a one-character title', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Document title').fill('A');
  await page.getByRole('button', { name: 'Create request' }).click();

  await expect(page.getByRole('heading', { name: 'A', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Status: Pending');
});

test('approves a request and shows the saved state after reload', async ({ page }) => {
  await createRequest(page);
  const response = await submitCode(page, '123456');
  expect(response.status()).toBe(200);
  await expect(page.getByRole('status')).toHaveText('Status: Approved');
  await expect(page.getByRole('button', { name: 'Approve document' })).toBeHidden();
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Status: Approved');
  await expect(page.getByText(/^Approved at:/)).toBeVisible();
});

test('shows an error for a wrong code and lets the user retry', async ({ page }) => {
  await createRequest(page);
  const approvalAlert = page.getByRole('region', { name: 'Purchase request' }).getByRole('alert');
  await page.getByLabel('Approval code').fill('1234567');
  await expect(approvalAlert).toBeHidden();
  await page.getByRole('button', { name: 'Approve document' }).click();
  await expect(page.getByLabel('Approval code')).toHaveValue('1234567');
  await expect(approvalAlert).toHaveText('Enter exactly six digits (0-9).');
  await expect(page.locator('#approval-attempt')).toHaveText('Last attempt: Failed');
  await expect(page.getByRole('status')).toHaveText('Status: Pending');

  const rejected = await submitCode(page, '999999');
  expect(rejected.status()).toBe(422);
  await expect(approvalAlert).toHaveText('The approval code is incorrect.');
  await expect(page.locator('#approval-attempt')).toHaveText('Last attempt: Failed');
  await expect(page.getByRole('status')).toHaveText('Status: Pending');

  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Status: Pending');
  await expect(page.locator('#approval-attempt')).toBeHidden();

  const accepted = await submitCode(page, '123456');
  expect(accepted.status()).toBe(200);
  await expect(approvalAlert).toBeHidden();
  await expect(page.locator('#approval-attempt')).toBeHidden();
  await expect(page.getByRole('status')).toHaveText('Status: Approved');
});

test('approves a document whose code starts with zero @leading-zero', async ({ page }) => {
  await createRequest(page, 'leading-zero');
  const response = await submitCode(page, '042731');
  if (response.status() === 422) {
    await expect(page.getByRole('alert')).toHaveText('The approval code is incorrect.');
    await expect(page.getByRole('status')).toHaveText('Status: Pending');
    await expect(page.getByRole('button', { name: 'Approve document' })).toBeEnabled();
  }
  expect(response.status(), await response.text()).toBe(200);
  await expect(page.getByRole('status')).toHaveText('Status: Approved');
});

test('refreshes a stale approval in a second tab without changing the timestamp', async ({ page, context }) => {
  await createRequest(page);
  const secondTab = await context.newPage();
  await secondTab.goto(page.url());
  await expect(secondTab.getByRole('status')).toHaveText('Status: Pending');

  const firstApproval = await submitCode(page, '123456');
  expect(firstApproval.status()).toBe(200);
  const { approvedAt } = await firstApproval.json();
  await expect(page.getByRole('status')).toHaveText('Status: Approved');

  const duplicate = await submitCode(secondTab, '123456');
  expect(duplicate.status()).toBe(409);
  expect(await duplicate.json()).toMatchObject({ error: { code: 'ALREADY_APPROVED' } });
  await expect(secondTab.getByRole('status')).toHaveText('Status: Approved');
  const formattedApprovalTime = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(approvedAt));
  await expect(secondTab.getByText(`Approved at: ${formattedApprovalTime} WIB`, { exact: true })).toBeVisible();
  await expect(secondTab.getByRole('button', { name: 'Approve document' })).toBeHidden();
});

test('synchronizes two tabs after simultaneous approval attempts', async ({ page, context }) => {
  await createRequest(page);
  const secondTab = await context.newPage();
  await secondTab.goto(page.url());
  await expect(secondTab.getByRole('status')).toHaveText('Status: Pending');

  let releaseApprovals;
  const bothApprovalsReady = new Promise(resolve => { releaseApprovals = resolve; });
  let approvalsSeen = 0;
  const holdApproval = async route => {
    approvalsSeen += 1;
    if (approvalsSeen === 2) releaseApprovals();
    await bothApprovalsReady;
    await route.continue();
  };
  await page.route('**/api/requests/*/approve', holdApproval);
  await secondTab.route('**/api/requests/*/approve', holdApproval);

  await Promise.all([
    page.getByLabel('Approval code').fill('123456'),
    secondTab.getByLabel('Approval code').fill('123456'),
  ]);
  const firstResponse = page.waitForResponse(
    response => response.request().method() === 'POST' && response.url().endsWith('/approve'),
  );
  const secondResponse = secondTab.waitForResponse(
    response => response.request().method() === 'POST' && response.url().endsWith('/approve'),
  );
  await Promise.all([
    page.getByRole('button', { name: 'Approve document' }).click(),
    secondTab.getByRole('button', { name: 'Approve document' }).click(),
  ]);
  const responses = await Promise.all([firstResponse, secondResponse]);

  expect(responses.map(response => response.status()).sort()).toEqual([200, 409]);
  await expect(page.getByRole('status')).toHaveText('Status: Approved');
  await expect(secondTab.getByRole('status')).toHaveText('Status: Approved');
  const timestamps = await Promise.all([
    page.getByText(/^Approved at:/).textContent(),
    secondTab.getByText(/^Approved at:/).textContent(),
  ]);
  expect(timestamps[0]).toBe(timestamps[1]);
});

test('validates an overlong title and wraps an 80-character title on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const title = 'W'.repeat(80);
  const overlongTitle = 'W'.repeat(81);
  const titleInput = page.getByLabel('Document title');
  await titleInput.pressSequentially(overlongTitle);
  await expect(titleInput).toHaveValue(overlongTitle);
  await expect(page.locator('#title-error')).toBeHidden();
  await page.getByRole('button', { name: 'Create request' }).click();
  await expect(page.locator('#title-error')).toHaveText('Document title must be 80 characters or fewer.');
  await expect(page.locator('#request')).toBeHidden();

  await titleInput.fill(title);
  await page.getByRole('button', { name: 'Create request' }).click();

  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const { clientWidth, scrollWidth } = await page.locator('html').evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(scrollWidth).toBe(clientWidth);
});
