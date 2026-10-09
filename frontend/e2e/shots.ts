import { Page } from '@playwright/test';
import { join } from 'path';

const DIR = join(__dirname, '..', '..', 'docs', 'design', 'app-screens');

/** Saves a full-page screenshot of the real app into docs/design/app-screens (only when SCREENSHOTS=1). */
export async function shot(page: Page, name: string): Promise<void> {
  if (!process.env['SCREENSHOTS']) return;
  await page.evaluate(() => document.fonts.ready);
  // A fixed bottom bar would be painted mid-page in a full-page capture; pin it to the end instead.
  const style = await page.addStyleTag({ content: 'nav.bottom { position: static !important; }' });
  await page.screenshot({ path: join(DIR, `${name}.png`), fullPage: true });
  await style.evaluate((el) => el.remove());
}
