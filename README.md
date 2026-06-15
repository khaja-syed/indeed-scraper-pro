# Indeed Scraper Pro

Fast, accurate Indeed job scraper for the Apify platform. Pulls listings, salaries, descriptions, requirements, benefits, and company data across 27 countries — with cross-run deduplication and change detection.

## Why this Actor

| | Indeed Scraper Pro | Typical alternatives |
|---|---|---|
| Data source | Embedded `__NEXT_DATA__` / mosaic JSON (stable) | Brittle CSS selectors |
| Output fields | 25+ incl. salaryMin/Max, workModel, requirements, benefits, contentHash | ~12 |
| Pricing | Pay-per-event from **$2.50 / 1,000** list-only or $5 / 1k with full description | $3 / 1k flat |
| Bandwidth | List-page extracts 90% of fields → optional detail-page hop | Always fetches detail pages |
| Dedup | Cross-run via key-value store on Indeed `jobkey` | Per-run only |
| Change tracking | `contentHash` per job → diff salary/title across runs | None |
| Countries | 27 (en/es/fr/de/it/pt/ja/nl locales) | 5–10 |

## Inputs

| Field | Type | Default | Notes |
|---|---|---|---|
| `position` | string | — | Keywords / job title |
| `location` | string | — | City, region, postcode, or `remote` |
| `country` | enum | `US` | Routes to the right Indeed domain |
| `maxItemsPerSearch` | int | 100 | Indeed caps at ~1,000 per query — split by city/date for more |
| `startUrls` | array | `[]` | Indeed search, category, or `/cmp/<co>/jobs` URLs |
| `parseCompanyDetails` | bool | `false` | Visit each company page once (rating, HQ, size, industry) |
| `fetchFullDescription` | bool | `true` | Hit detail page for full description + apply link |
| `saveOnlyUniqueItems` | bool | `true` | Skip jobs already seen in prior runs |
| `followApplyRedirects` | bool | `false` | Resolve external apply URLs |
| `proxyConfiguration` | object | Apify residential | Required for production volume |
| `maxConcurrency` | int | 8 | Higher = faster + more proxy spend + higher block risk |

## Output (per job)

```jsonc
{
  "id": "abc123",
  "positionName": "Senior Software Engineer",
  "company": "Acme Corp",
  "companyUrl": "https://www.indeed.com/cmp/Acme-Corp",
  "location": "San Francisco, CA",
  "workModel": "Remote",
  "remoteFlag": true,
  "salary": "$160,000 - $200,000 a year",
  "salaryMin": 160000,
  "salaryMax": 200000,
  "salaryCurrency": "USD",
  "salaryPeriod": "year",
  "jobType": ["Fulltime"],
  "rating": 4.2,
  "reviewsCount": 1234,
  "postedAt": "2 days ago",
  "url": "https://www.indeed.com/viewjob?jk=abc123",
  "description": "...plain text...",
  "descriptionHTML": "<p>...</p>",
  "benefits": ["401k", "Health insurance"],
  "requirements": ["5+ years TypeScript", "..."],
  "externalApplyLink": "https://acme.com/apply/abc",
  "isExpired": false,
  "scrapedAt": "2026-06-15T10:30:00.000Z",
  "contentHash": "9f1b3e...",
  "companyDetails": { /* when parseCompanyDetails=true */ }
}
```

## Pricing (pay-per-event)

| Event | Price | Triggered when |
|---|---|---|
| `actor-start` | $0.02 | Once per run |
| `job-listing` | $0.0025 | Listing extracted from list page only (`fetchFullDescription=false`) |
| `job-listing-with-details` | $0.005 | Listing enriched with full description / apply link |
| `company-enriched` | $0.001 | Company profile fetched (one-time per run, per company) |

Indeed Apify platform compute is **not** billed separately — only the events above.

## Quick start

### Console
1. Open the Actor → Try it.
2. Set `position`, `location`, `country`. Click **Start**.
3. Download results from the dataset tab (JSON, CSV, Excel, XML).

### API (sync, small jobs)
```bash
curl -X POST "https://api.apify.com/v2/acts/<your-username>~indeed-scraper-pro/run-sync-get-dataset-items?token=$APIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"position":"react developer","location":"London","country":"GB","maxItemsPerSearch":50}'
```

### Node SDK
```ts
import { ApifyClient } from 'apify-client';
const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const run = await client.actor('<your-username>/indeed-scraper-pro').call({
  position: 'react developer',
  location: 'London',
  country: 'GB',
  maxItemsPerSearch: 200,
  fetchFullDescription: true,
});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
```

### Schedule + webhook
Schedule the Actor in the Console (e.g. hourly), and add a webhook on `ACTOR.RUN.SUCCEEDED` to your endpoint — payload includes `runId` + `defaultDatasetId` so you can pull the diff.

## Local development

```bash
npm install
npx playwright install chromium
npm run build
apify run    # uses ./apify_storage for input/output
```

Run tests: `npm test`. Push to Apify: `apify push`.

## Known limits

- Indeed caps results at ~1,000 per search — for larger crawls, split by city, date posted, or salary band.
- Some country domains use anti-bot stacks that require residential proxies.
- Selectors and JSON shape can change — parsers are pure functions covered by fixture tests, so fixes are usually a one-line change.

## Support

File issues with run ID + input JSON. The maintainer publishes patches within 24h for selector breakage on the top-3 country domains.
