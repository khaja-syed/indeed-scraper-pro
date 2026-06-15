import { Actor } from 'apify';
import { createPlaywrightRouter, log, sleep } from 'crawlee';
import type { Page } from 'playwright';
import { buildSearchUrl, buildDetailUrl, RESULTS_PER_PAGE } from './constants.js';
import { contentHash, parseCompanyPage, parseDetailJson, parseSearchPage } from './parsers.js';
import { SeenStore } from './dedup.js';
import type { CountryCode, Input, Job, PartialJob, UserData } from './types.js';

interface RouterDeps {
  input: Required<Pick<Input, 'country' | 'maxItemsPerSearch' | 'parseCompanyDetails' | 'fetchFullDescription' | 'saveOnlyUniqueItems' | 'followApplyRedirects'>>;
  seen: SeenStore;
  enrichedCompanies: Set<string>;
}

export function createRouter(deps: RouterDeps) {
  const router = createPlaywrightRouter();

  router.addHandler<UserData>('SEARCH', async ({ page, request, crawler }) => {
    const data = request.userData;
    if (data.label !== 'SEARCH') return;
    if (data.itemsScraped >= data.maxItems) return;

    await dismissOverlays(page);
    const json = await readNextDataOrMosaic(page);
    if (!json) {
      log.warning(`No JSON state found on ${request.url}`);
      return;
    }
    const domain = new URL(request.url).host;
    const { jobs, nextStart } = parseSearchPage(json, domain);
    log.info(`Search ${data.searchId}: ${jobs.length} jobs on ${request.url}`);

    let enqueued = 0;
    for (const partial of jobs) {
      if (data.itemsScraped + enqueued >= data.maxItems) break;
      if (deps.input.saveOnlyUniqueItems && deps.seen.has(partial.id)) continue;

      if (deps.input.fetchFullDescription) {
        await crawler.addRequests([{
          url: buildDetailUrl(deps.input.country as CountryCode, partial.id),
          label: 'DETAIL',
          userData: { label: 'DETAIL', searchId: data.searchId, partial } satisfies UserData,
        }]);
      } else {
        await emitJob(partial, undefined, deps);
      }
      enqueued += 1;
    }
    data.itemsScraped += enqueued;

    if (nextStart !== null && data.itemsScraped < data.maxItems) {
      const url = withStart(request.url, nextStart);
      await crawler.addRequests([{ url, label: 'SEARCH', userData: data }]);
    }
  });

  router.addHandler<UserData>('DETAIL', async ({ page, request, crawler }) => {
    const data = request.userData;
    if (data.label !== 'DETAIL') return;

    await dismissOverlays(page);
    const json = await readNextDataOrMosaic(page);
    const detail = json ? parseDetailJson(extractJobInfo(json)) : null;
    if (!detail) {
      log.warning(`Detail parse failed: ${request.url}`);
      await emitJob(data.partial, undefined, deps);
      return;
    }

    if (deps.input.followApplyRedirects && detail.externalApplyLink) {
      detail.externalApplyLink = await resolveRedirect(page, detail.externalApplyLink);
    }

    await emitJob({ ...data.partial, source: 'detail' }, detail, deps);

    if (deps.input.parseCompanyDetails && data.partial.companyUrl && !deps.enrichedCompanies.has(data.partial.company)) {
      deps.enrichedCompanies.add(data.partial.company);
      await crawler.addRequests([{
        url: data.partial.companyUrl,
        label: 'COMPANY',
        userData: { label: 'COMPANY', companyKey: data.partial.company } satisfies UserData,
      }]);
    }
  });

  router.addHandler<UserData>('COMPANY', async ({ page, request }) => {
    const data = request.userData;
    if (data.label !== 'COMPANY') return;
    await dismissOverlays(page);
    const json = await readNextDataOrMosaic(page);
    const details = json ? parseCompanyPage(json, request.url) : null;
    if (!details) return;
    await Actor.charge({ eventName: 'company-enriched' }).catch(() => undefined);
    const store = await Actor.openKeyValueStore('COMPANY_DETAILS');
    await store.setValue(slug(data.companyKey), details);
  });

  return router;
}

async function emitJob(partial: PartialJob, detail: Awaited<ReturnType<typeof parseDetailJson>> | undefined, deps: RouterDeps): Promise<void> {
  const hash = contentHash({ ...partial, description: detail?.description });
  if (deps.input.saveOnlyUniqueItems && !deps.seen.changed(partial.id, hash)) return;

  const job: Job = {
    ...partial,
    ...(detail ?? {}),
    scrapedAt: new Date().toISOString(),
    contentHash: hash,
  };

  await Actor.pushData(job);
  await Actor.charge({ eventName: detail ? 'job-listing-with-details' : 'job-listing' }).catch(() => undefined);
  deps.seen.mark(partial.id, hash);
}

async function readNextDataOrMosaic(page: Page): Promise<unknown | null> {
  return page.evaluate(() => {
    const w = window as unknown as { mosaic?: unknown; _initialData?: unknown };
    const next = document.getElementById('__NEXT_DATA__');
    if (next?.textContent) {
      try { return JSON.parse(next.textContent); } catch { /* fall through */ }
    }
    if (w.mosaic) return { mosaic: w.mosaic };
    return w._initialData ?? null;
  });
}

function extractJobInfo(json: unknown): Parameters<typeof parseDetailJson>[0] {
  const root = json as { props?: { pageProps?: unknown } } | null;
  return (root?.props?.pageProps ?? root) as Parameters<typeof parseDetailJson>[0];
}

async function dismissOverlays(page: Page): Promise<void> {
  const selectors = ['#onetrust-accept-btn-handler', 'button:has-text("Accept")', 'button[aria-label="close"]'];
  for (const sel of selectors) {
    const button = page.locator(sel).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => undefined);
      await sleep(300);
    }
  }
}

async function resolveRedirect(page: Page, url: string): Promise<string> {
  try {
    const res = await page.context().request.get(url, { maxRedirects: 5 });
    return res.url();
  } catch {
    return url;
  }
}

function withStart(url: string, start: number): string {
  const u = new URL(url);
  u.searchParams.set('start', String(start));
  return u.toString();
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

export function buildInitialRequests(input: Input): { url: string; label: 'SEARCH'; userData: UserData }[] {
  const country = (input.country ?? 'US') as CountryCode;
  const maxItems = input.maxItemsPerSearch ?? 100;
  const requests: { url: string; label: 'SEARCH'; userData: UserData }[] = [];

  if (input.position || input.location) {
    const url = buildSearchUrl({ country, ...(input.position ? { position: input.position } : {}), ...(input.location ? { location: input.location } : {}) });
    requests.push({
      url,
      label: 'SEARCH',
      userData: { label: 'SEARCH', searchId: `kw:${input.position ?? ''}@${input.location ?? ''}`, itemsScraped: 0, maxItems },
    });
  }

  for (const item of input.startUrls ?? []) {
    requests.push({
      url: item.url,
      label: 'SEARCH',
      userData: { label: 'SEARCH', searchId: `url:${item.url}`, itemsScraped: 0, maxItems },
    });
  }

  return requests;
}

export const PAGE_SIZE = RESULTS_PER_PAGE;
