import { Page } from 'playwright';
import { NewsItem } from '../../types/crawl';

export async function crawlTuoiTre(page: Page): Promise<NewsItem> {
  const title = (await page.textContent('h1.article-title'))?.trim() || (await page.title());
  const content = await page.locator('#main-content-body').innerText();
  const summary = (await page.textContent('.sapo'))?.trim();
  const author = (await page.textContent('.author'))?.trim();
  const publishedAt = (await page.getAttribute('meta[name="pubdate"]', 'content')) ?? undefined;
  const tags = await page.locator('.tags-box a').allInnerTexts();
  const images = await page.locator('.VCSortableInPreviewMode img').allAttributeValues('src');

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
