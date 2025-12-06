import { Page } from 'playwright';
import { NewsItem } from '../../types/crawl';

export async function crawlVnExpress(page: Page): Promise<NewsItem> {
  const title = (await page.textContent('article .title-detail'))?.trim() || (await page.title());
  const summary = (await page.textContent('article .description'))?.trim();
  const content = await page.locator('article .fck_detail').innerText();
  const author = (await page.textContent('article .author_mail strong'))?.trim();
  const publishedAt = (await page.getAttribute('meta[property="article:published_time"]', 'content')) ?? undefined;
  const images = await page.locator('article figure img').allAttributeValues('src');
  const tags = await page.locator('.list-tag a').allInnerTexts();

  return {
    title,
    summary,
    content,
    author,
    publishedAt,
    tags: tags?.map((tag) => tag.trim()).filter(Boolean),
    images: images?.filter(Boolean),
  };
}
