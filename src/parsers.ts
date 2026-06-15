import { createHash } from 'node:crypto';
import type { PartialJob, CompanyDetails } from './types.js';

export function contentHash(job: Pick<PartialJob, 'positionName' | 'company' | 'location' | 'salary'> & { description?: string | undefined }): string {
  const payload = [job.positionName, job.company, job.location, job.salary ?? '', job.description ?? ''].join('|');
  return createHash('sha1').update(payload).digest('hex');
}

interface MosaicJob {
  jobkey?: string;
  title?: string;
  company?: string;
  companyOverviewLink?: string;
  formattedLocation?: string;
  remoteWorkModel?: { type?: string };
  salarySnippet?: { text?: string; currency?: string };
  estimatedSalary?: { formattedRange?: string };
  jobTypes?: string[];
  companyRating?: number;
  companyReviewCount?: number;
  formattedRelativeTime?: string;
  viewJobLink?: string;
  expired?: boolean;
}

export function parseSearchPage(json: unknown, domain: string): { jobs: PartialJob[]; nextStart: number | null; total: number | null } {
  const jobs: PartialJob[] = [];
  const list = extractMosaicList(json);
  for (const raw of list) {
    const job = mosaicToPartial(raw, domain);
    if (job) jobs.push(job);
  }
  const meta = extractMosaicMeta(json);
  return { jobs, nextStart: meta.nextStart, total: meta.total };
}

function extractMosaicList(root: unknown): MosaicJob[] {
  const provider = pick(root, ['mosaic', 'providerData', 'mosaic-provider-jobcards']);
  const results = pick(provider, ['metaData', 'mosaicProviderJobCardsModel', 'results']);
  if (Array.isArray(results)) return results as MosaicJob[];
  const fallback = pick(root, ['props', 'pageProps', 'jobList']);
  return Array.isArray(fallback) ? (fallback as MosaicJob[]) : [];
}

function extractMosaicMeta(root: unknown): { nextStart: number | null; total: number | null } {
  const provider = pick(root, ['mosaic', 'providerData', 'mosaic-provider-jobcards']);
  const meta = pick(provider, ['metaData', 'mosaicProviderJobCardsModel']);
  const total = numeric(pick(meta, ['totalJobCount']));
  const pageStart = numeric(pick(meta, ['start'])) ?? 0;
  const pageSize = numeric(pick(meta, ['pageSize'])) ?? 15;
  if (total !== null && pageStart + pageSize >= total) return { nextStart: null, total };
  return { nextStart: pageStart + pageSize, total };
}

function mosaicToPartial(raw: MosaicJob, domain: string): PartialJob | null {
  const id = raw.jobkey;
  const title = raw.title;
  const company = raw.company;
  if (!id || !title || !company) return null;

  const salary = raw.salarySnippet?.text ?? raw.estimatedSalary?.formattedRange;
  const remoteType = raw.remoteWorkModel?.type;
  const workModel = remoteType === 'EXCLUSIVELY_REMOTE' ? 'Remote'
    : remoteType === 'HYBRID' ? 'Hybrid'
    : remoteType ? 'On-site' : undefined;

  const partial: PartialJob = {
    id,
    positionName: title,
    company,
    location: raw.formattedLocation ?? '',
    url: `https://${domain}/viewjob?jk=${id}`,
    source: 'list',
  };
  if (raw.companyOverviewLink) partial.companyUrl = `https://${domain}${raw.companyOverviewLink}`;
  if (workModel) partial.workModel = workModel;
  if (workModel === 'Remote') partial.remoteFlag = true;
  if (salary) {
    partial.salary = salary;
    Object.assign(partial, parseSalaryRange(salary));
  }
  if (raw.jobTypes?.length) partial.jobType = raw.jobTypes;
  if (typeof raw.companyRating === 'number') partial.rating = raw.companyRating;
  if (typeof raw.companyReviewCount === 'number') partial.reviewsCount = raw.companyReviewCount;
  if (raw.formattedRelativeTime) partial.postedAt = raw.formattedRelativeTime;
  return partial;
}

const SALARY_REGEX = /([£$€₹¥])\s*([\d,.]+)\s*(?:[–-]\s*[£$€₹¥]?\s*([\d,.]+))?\s*(?:a|per)?\s*(hour|day|week|month|year)?/i;

export function parseSalaryRange(text: string): Pick<PartialJob, 'salaryMin' | 'salaryMax' | 'salaryCurrency' | 'salaryPeriod'> {
  const match = text.match(SALARY_REGEX);
  if (!match) return {};
  const [, currencySym, minRaw, maxRaw, period] = match;
  const currency = currencyFromSymbol(currencySym);
  const result: Pick<PartialJob, 'salaryMin' | 'salaryMax' | 'salaryCurrency' | 'salaryPeriod'> = {};
  if (minRaw) {
    const min = Number(minRaw.replace(/,/g, ''));
    if (!Number.isNaN(min)) result.salaryMin = min;
  }
  if (maxRaw) {
    const max = Number(maxRaw.replace(/,/g, ''));
    if (!Number.isNaN(max)) result.salaryMax = max;
  }
  if (currency) result.salaryCurrency = currency;
  if (period) result.salaryPeriod = period.toLowerCase() as PartialJob['salaryPeriod'];
  return result;
}

function currencyFromSymbol(sym: string | undefined): string | undefined {
  switch (sym) {
    case '$': return 'USD';
    case '£': return 'GBP';
    case '€': return 'EUR';
    case '₹': return 'INR';
    case '¥': return 'JPY';
    default: return undefined;
  }
}

export interface DetailPayload {
  description: string;
  descriptionHTML: string;
  benefits: string[];
  requirements: string[];
  externalApplyLink?: string;
  isExpired: boolean;
}

interface DetailJson {
  jobInfoWrapperModel?: {
    jobInfoModel?: {
      sanitizedJobDescription?: string;
      jobDescriptionSectionModel?: { html?: string };
      benefitsModel?: { benefits?: { label?: string }[] };
    };
  };
  hostQueryExecutionResult?: { data?: { jobData?: { results?: { job?: { applyButtonLink?: string } }[] } } };
  expired?: boolean;
}

export function parseDetailJson(json: DetailJson): DetailPayload {
  const info = json.jobInfoWrapperModel?.jobInfoModel;
  const html = info?.jobDescriptionSectionModel?.html ?? '';
  const description = stripHtml(info?.sanitizedJobDescription ?? html);
  const benefits = (info?.benefitsModel?.benefits ?? []).map((b) => b.label ?? '').filter(Boolean);
  const requirements = extractRequirements(description);
  const externalApplyLink = json.hostQueryExecutionResult?.data?.jobData?.results?.[0]?.job?.applyButtonLink;
  return {
    description,
    descriptionHTML: html,
    benefits,
    requirements,
    ...(externalApplyLink ? { externalApplyLink } : {}),
    isExpired: Boolean(json.expired),
  };
}

const REQ_HEADER = /(requirements|qualifications|what you'?ll need|must have)\s*[:\n]/i;
function extractRequirements(text: string): string[] {
  const idx = text.search(REQ_HEADER);
  if (idx < 0) return [];
  const slice = text.slice(idx, idx + 2000);
  return slice
    .split(/\n+/)
    .map((line) => line.replace(/^[\s•\-*\d.]+/, '').trim())
    .filter((line) => line.length > 6 && line.length < 240)
    .slice(1, 12);
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseCompanyPage(json: unknown, url: string): CompanyDetails | null {
  const profile = pick(json, ['companyProfile']) ?? pick(json, ['props', 'pageProps', 'companyProfile']);
  if (!profile || typeof profile !== 'object') return null;
  const name = pick(profile, ['name']);
  if (typeof name !== 'string') return null;
  const details: CompanyDetails = { name, url };
  const rating = numeric(pick(profile, ['rating']));
  const reviews = numeric(pick(profile, ['reviewCount']));
  const hq = pick(profile, ['headquartersLocation']);
  const size = pick(profile, ['size']);
  const industry = pick(profile, ['industry']);
  const founded = pick(profile, ['founded']);
  if (rating !== null) details.rating = rating;
  if (reviews !== null) details.reviewsCount = reviews;
  if (typeof hq === 'string') details.hq = hq;
  if (typeof size === 'string') details.size = size;
  if (typeof industry === 'string') details.industry = industry;
  if (typeof founded === 'string') details.founded = founded;
  return details;
}

function pick(obj: unknown, path: string[]): unknown {
  let cursor: unknown = obj;
  for (const key of path) {
    if (cursor && typeof cursor === 'object' && key in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return cursor;
}

function numeric(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
