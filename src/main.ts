import { Actor } from 'apify';
import { PlaywrightCrawler, log } from 'crawlee';
import { buildInitialRequests, createRouter } from './routes.js';
import { SeenStore } from './dedup.js';
import type { Input } from './types.js';

await Actor.init();

const input = (await Actor.getInput<Input>()) ?? {};
if (input.debug) log.setLevel(log.LEVELS.DEBUG);

await Actor.charge({ eventName: 'actor-start' }).catch(() => undefined);

const seen = new SeenStore();
if (input.saveOnlyUniqueItems !== false) await seen.init();

const router = createRouter({
  input: {
    country: input.country ?? 'US',
    maxItemsPerSearch: input.maxItemsPerSearch ?? 100,
    parseCompanyDetails: input.parseCompanyDetails ?? false,
    fetchFullDescription: input.fetchFullDescription ?? true,
    saveOnlyUniqueItems: input.saveOnlyUniqueItems ?? true,
    followApplyRedirects: input.followApplyRedirects ?? false,
  },
  seen,
  enrichedCompanies: new Set<string>(),
});

const proxyConfiguration = await Actor.createProxyConfiguration(
  input.proxyConfiguration ?? { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
);

const crawler = new PlaywrightCrawler({
  ...(proxyConfiguration ? { proxyConfiguration } : {}),
  requestHandler: router,
  maxConcurrency: input.maxConcurrency ?? 8,
  maxRequestRetries: 5,
  navigationTimeoutSecs: 60,
  requestHandlerTimeoutSecs: 90,
  launchContext: { launchOptions: { headless: true } },
  browserPoolOptions: {
    useFingerprints: true,
    fingerprintOptions: {
      fingerprintGeneratorOptions: {
        locales: [localeFor(input.country ?? 'US')],
        operatingSystems: ['windows', 'macos'],
      },
    },
  },
  preNavigationHooks: [
    async ({ page }, gotoOptions) => {
      gotoOptions.waitUntil = 'domcontentloaded';
      await page.route('**/*', (route) => {
        const type = route.request().resourceType();
        return ['image', 'media', 'font'].includes(type) ? route.abort() : route.continue();
      });
    },
  ],
  failedRequestHandler: async ({ request, error }) => {
    log.error(`FAILED ${request.url}: ${(error as Error).message}`);
  },
});

const initial = buildInitialRequests(input);
if (initial.length === 0) {
  log.warning('No position/location and no startUrls provided. Nothing to do.');
} else {
  await crawler.run(initial);
}

if (input.saveOnlyUniqueItems !== false) await seen.flush();
await Actor.exit();

function localeFor(country: string): string {
  const map: Record<string, string> = { US: 'en-US', GB: 'en-GB', CA: 'en-CA', AU: 'en-AU', DE: 'de-DE', FR: 'fr-FR', ES: 'es-ES', IT: 'it-IT', JP: 'ja-JP', BR: 'pt-BR', MX: 'es-MX', IN: 'en-IN', NL: 'nl-NL' };
  return map[country] ?? 'en-US';
}
