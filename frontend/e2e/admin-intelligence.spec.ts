import { expect, Page, test } from '@playwright/test';
import { shot } from './shots';

const email = process.env['E2E_ADMIN_EMAIL'] ?? 'demo-admin@chlatvei.local';
const password = process.env['E2E_ADMIN_PASSWORD'] ?? '';

async function signInAsAdmin(page: Page): Promise<void> {
  await page.goto('/signin?next=/admin/dashboard');
  await page.getByRole('button', { name: 'EN' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
}

/**
 * Phase 8: the admin screens around the verification workflow, on the full stack
 * (Angular → NestJS → ML service → PostgreSQL, demo database).
 */
test.describe('admin intelligence screens', () => {
  test.skip(!password, 'Set E2E_ADMIN_PASSWORD (see docs/frontend/README.md)');

  test('extraction from a source lands in the review queue as EXTRACTED, and can be rejected', async ({ page }) => {
    await signInAsAdmin(page);
    await page.getByRole('link', { name: 'Sources' }).click();

    const s003 = page.locator('article', { hasText: 'S003' });
    await s003.getByRole('button', { name: 'Details' }).click();
    await expect(s003.getByText('Collected copies')).toBeVisible();
    await s003.getByRole('button', { name: 'Extract into review queue' }).click();
    await expect(s003.getByRole('status')).toContainText(/findings added to the review queue|No new findings/);
    await shot(page, '08-admin-sources-extract-en');

    await s003.getByRole('link', { name: /Open review queue/ }).click();
    await expect(page).toHaveURL(/origin=EXTRACTED/);
    await expect(page.getByRole('button', { name: 'Extracted', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const first = page.locator('.qitem').first();
    await first.click();
    await expect(page.getByText(/Found automatically/)).toBeVisible();
    await expect(page.getByText(/Confidence \d+%/)).toBeVisible();
    await shot(page, '09-admin-review-extracted-en');

    const before = await page.locator('.qitem').count();
    await page.getByLabel(/Comment/).fill('Not a requirement: FAQ question text');
    await page.getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByRole('status')).toContainText('Rejected');
    await expect(page.locator('.qitem')).toHaveCount(before - 1);
  });

  test('feedback can be resolved and found under Resolved', async ({ page }) => {
    await signInAsAdmin(page);
    await page.getByRole('link', { name: 'Feedback' }).click();
    const item = page.locator('article', { hasText: 'Demo feedback' }).first();
    await expect(item).toBeVisible();
    await expect(item.getByText(/Confusing step:/)).toBeVisible();
    await shot(page, '10-admin-feedback-en');
    await item.getByRole('button', { name: 'Mark resolved' }).click();
    await expect(page.locator('article', { hasText: 'Demo feedback' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Resolved', exact: true }).click();
    await expect(page.locator('article', { hasText: 'Demo feedback' }).first()).toBeVisible();
  });

  test('complexity scores show on the dashboard and can be recomputed', async ({ page }) => {
    await signInAsAdmin(page);
    const section = page.locator('section', { hasText: 'Complexity (ChlatVei estimate)' });
    await expect(section.getByText(/Driver.s license|ផ្តល់បណ្ណបើកបរ/)).toBeVisible();
    await section.getByRole('button', { name: 'Recompute scores' }).click();
    await expect(section.getByRole('status')).toContainText('services updated');
    await shot(page, '11-admin-dashboard-complexity-en');
  });

  test('role changes need a second tap to confirm', async ({ page }) => {
    await signInAsAdmin(page);
    await page.getByRole('link', { name: 'Users' }).click();
    await page.getByLabel('Search by name or email').fill('demo-citizen');
    const user = page.locator('article', { hasText: 'demo-citizen' }).first();
    await expect(user).toBeVisible();

    const roleButton = user.getByRole('button', { name: /Make admin|Tap again/ });
    await roleButton.click();
    await expect(user.getByRole('button', { name: 'Tap again to confirm' })).toBeVisible();
    await expect(user.getByText('CITIZEN', { exact: true })).toBeVisible(); // nothing changed yet
    await user.getByRole('button', { name: 'Tap again to confirm' }).click();
    await expect(user.getByText('ADMIN', { exact: true })).toBeVisible();

    // Put it back.
    await user.getByRole('button', { name: 'Make citizen' }).click();
    await user.getByRole('button', { name: 'Tap again to confirm' }).click();
    await expect(user.getByText('CITIZEN', { exact: true })).toBeVisible();
    // The admin's own row offers no role or deactivate buttons.
    await page.getByLabel('Search by name or email').fill(email);
    const me = page.locator('article', { hasText: email });
    await expect(me.getByText('You')).toBeVisible();
    await expect(me.getByRole('button')).toHaveCount(0);
  });
});
