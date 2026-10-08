import { expect, test } from '@playwright/test';
import { shot } from './shots';

const email = process.env['E2E_ADMIN_EMAIL'] ?? 'demo-admin@chlatvei.local';
const password = process.env['E2E_ADMIN_PASSWORD'] ?? '';

/**
 * Spec §22 flow 2: admin receives imported information → reviews it → approves it →
 * the information becomes public. Uses a vehicle-registration item that is still PENDING.
 */
test('admin verifies a source, adds Khmer text, approves, and the item leaves the queue', async ({ page }) => {
  test.skip(!password, 'Set E2E_ADMIN_PASSWORD (see docs/frontend/README.md)');

  await page.goto('/signin?next=/admin/review');
  await page.getByRole('button', { name: 'EN' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin\/review$/);

  // Pick a pending vehicle-registration document.
  const item = page.getByRole('button', { name: /Letter from the dealer/ });
  await expect(item).toBeVisible();
  await item.click();
  await expect(page.getByText('letter from the dealer', { exact: true })).toBeVisible(); // evidence quote
  const approve = page.getByRole('button', { name: 'Approve' });
  await expect(approve).toBeDisabled(); // no Khmer text, source not verified
  await expect(page.getByText('This source is not verified yet')).toBeVisible();
  await shot(page, '06-admin-review-en');

  // Verify the vehicle-registration source (S003).
  await page.getByRole('link', { name: 'Sources' }).click();
  const s003 = page.locator('article', { hasText: 'S003' });
  await s003.getByRole('button', { name: 'Verify' }).click();
  await expect(s003.getByText('VERIFIED')).toBeVisible();

  // Back to review: add the Khmer text, save, approve.
  await page.getByRole('link', { name: 'Review' }).click();
  await page.getByRole('button', { name: /Letter from the dealer/ }).click();
  await page.getByLabel(/Khmer text/).fill('លិខិតពីក្រុមហ៊ុនលក់រថយន្ត');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(page.getByRole('status')).toContainText('Approved');
  await expect(page.getByRole('button', { name: /Letter from the dealer/ })).toHaveCount(0);

  // Reject needs a comment.
  const reject = page.getByRole('button', { name: 'Reject' });
  await expect(reject).toBeDisabled();

  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByText('Waiting for review', { exact: true })).toBeVisible();
  await expect(page.getByText('Most confusing steps (95% interval)')).toBeVisible();
  await shot(page, '07-admin-dashboard-en');
});
