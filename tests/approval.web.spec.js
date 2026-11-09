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
  const rejected = await submitCode(page, '999999');
  expect(rejected.status()).toBe(422);
  const approvalAlert = page.getByRole('region', { name: 'Purchase request' }).getByRole('alert');
  await expect(approvalAlert).toHaveText('The approval code is incorrect.');
  await expect(page.getByRole('status')).toHaveText('Status: Pending');

  const accepted = await submitCode(page, '123456');
  expect(accepted.status()).toBe(200);
  await expect(approvalAlert).toBeHidden();
  await expect(page.getByRole('status')).toHaveText('Status: Approved');
});

test('approves a document whose code starts with zero @leading-zero', async ({ page }) => {
  await createRequest(page, 'leading-zero');
  const response = await submitCode(page, '042731');
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
  await expect(secondTab.getByText(`Approved at: ${approvedAt}`, { exact: true })).toBeVisible();
  await expect(secondTab.getByRole('button', { name: 'Approve document' })).toBeHidden();
});

test('wraps a long unbroken document title on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const title = 'W'.repeat(80);
  await page.getByLabel('Document title').fill(title);
  await page.getByRole('button', { name: 'Create request' }).click();

  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const { clientWidth, scrollWidth } = await page.locator('html').evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(scrollWidth).toBe(clientWidth);
});
