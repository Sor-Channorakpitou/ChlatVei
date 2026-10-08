import { expect, test } from '@playwright/test';
import { shot } from './shots';

/**
 * Spec §22 flow 1, on a phone-sized screen, in Khmer (the default language):
 * citizen searches → views the service → creates a checklist → completes it → gives feedback.
 */
test('citizen finds a service, completes a checklist and gives feedback', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('តើអ្នកត្រូវការសេវាអ្វី?');
  await expect(page.getByRole('link', { name: /ផ្តល់បណ្ណបើកបរ/ })).toBeVisible();
  await shot(page, '01-home-km');

  // Search in Khmer with a phrase that never appears verbatim on the page
  // ("motorbike driving-license test"): keyword search misses it; the ML ranker (Phase 7) finds it.
  await page.getByRole('searchbox').fill('ប្រឡងបណ្ណបើកបរម៉ូតូ');
  await expect(page.getByText('លទ្ធផល')).toBeVisible();
  await page.getByRole('link', { name: /ផ្តល់បណ្ណបើកបរ/ }).first().click();

  // Service detail: verified content, the source, and "not stated" for processing time.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ផ្តល់បណ្ណបើកបរ');
  await expect(page.getByText('វិញ្ញាបនបត្របញ្ជាក់កាយសម្បទា')).toBeVisible();
  await expect(page.getByText('30,000 ៛').first()).toBeVisible();
  await expect(page.getByText('ប្រភពផ្លូវការមិនបានបញ្ជាក់')).toBeVisible();
  await expect(page.getByRole('link', { name: "Driver's License (Khmer)" })).toBeVisible();
  // ChlatVei's own complexity estimate is shown apart from official information.
  await expect(page.getByRole('heading', { name: 'តើសេវានេះស្មុគស្មាញប៉ុណ្ណា?' })).toBeVisible();
  await expect(page.getByText('មិនមែនជាព័ត៌មានផ្លូវការ', { exact: false })).toBeVisible();
  await shot(page, '02-service-detail-km');

  // English switch.
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page.getByText('Physical fitness (medical) certificate')).toBeVisible();
  await expect(page.getByText('Not stated by official sources')).toBeVisible();
  await shot(page, '03-service-detail-en');
  await page.getByRole('button', { name: 'ខ្មែរ' }).click();

  // Creating a checklist needs an account: sign-in page → register → back to the service.
  await page.getByRole('button', { name: 'ចូលគណនីដើម្បីបង្កើតបញ្ជី' }).click();
  await expect(page).toHaveURL(/\/signin\?next=/);
  await page.getByRole('link', { name: 'បង្កើតគណនី' }).click();
  await page.getByLabel('ឈ្មោះរបស់អ្នក').fill('Dara');
  await page.getByLabel('អ៊ីមែល').fill(`dara-${Date.now()}@example.test`);
  await page.getByLabel('ពាក្យសម្ងាត់').fill('mekong-river-2026');
  await page.getByRole('button', { name: 'បង្កើតគណនី' }).click();
  await expect(page).toHaveURL(/\/services\/driver_license_ab$/);

  await page.getByRole('button', { name: 'បង្កើតបញ្ជីត្រួតពិនិត្យ' }).click();
  await expect(page).toHaveURL(/\/checklists\/[0-9a-f-]+$/);
  const boxes = page.getByRole('checkbox');
  const total = await boxes.count();
  expect(total).toBeGreaterThan(3);
  for (let i = 0; i < 3; i++) await boxes.nth(i).check();
  await expect(page.getByText(`រួចរាល់ 3 ក្នុងចំណោម ${total}`)).toBeVisible();
  await shot(page, '04-checklist-km');
  for (let i = 3; i < total; i++) await boxes.nth(i).check();
  await expect(page.getByText('រួចរាល់ទាំងអស់។ សូមសំណាងល្អ!')).toBeVisible();

  // Progress is saved on the server: it survives a reload.
  await page.reload();
  await expect(page.getByText(`រួចរាល់ ${total} ក្នុងចំណោម ${total}`)).toBeVisible();

  // Feedback with a confusing step.
  await page.goto('/services/driver_license_ab/feedback');
  await page.getByRole('group', { name: /ងាយយល់/ }).getByRole('button', { name: '4' }).click();
  await page.getByRole('group', { name: /ពិបាកប៉ុណ្ណា/ }).getByRole('button', { name: '3' }).click();
  await page.getByLabel('តើជំហានណាដែលធ្វើឱ្យអ្នកច្រឡំ?').selectOption({ index: 1 });
  await shot(page, '05-feedback-km');
  await page.getByRole('button', { name: 'ផ្ញើមតិយោបល់' }).click();
  await expect(page.getByRole('status')).toHaveText('អរគុណ! មតិរបស់អ្នកជួយកំណត់ជំហានដែលពិបាក។');
});

test('citizens cannot open the admin area', async ({ page }) => {
  await page.goto('/admin/review');
  await expect(page).toHaveURL(/\/signin\?next=%2Fadmin%2Freview/);
});
