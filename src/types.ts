export type CountryCode =
  | 'US' | 'GB' | 'CA' | 'AU' | 'DE' | 'FR' | 'NL' | 'IN' | 'IE' | 'SG'
  | 'NZ' | 'ZA' | 'AE' | 'JP' | 'BR' | 'MX' | 'ES' | 'IT' | 'SE' | 'CH'
  | 'BE' | 'AT' | 'DK' | 'FI' | 'NO' | 'PL' | 'PT';

export interface Input {
  position?: string;
  location?: string;
  country?: CountryCode;
  maxItemsPerSearch?: number;
  startUrls?: { url: string }[];
  parseCompanyDetails?: boolean;
  fetchFullDescription?: boolean;
  saveOnlyUniqueItems?: boolean;
  followApplyRedirects?: boolean;
  proxyConfiguration?: Parameters<typeof import('apify').Actor.createProxyConfiguration>[0];
  maxConcurrency?: number;
  debug?: boolean;
}

export type RouteLabel = 'SEARCH' | 'DETAIL' | 'COMPANY';

export interface SearchUserData {
  label: 'SEARCH';
  searchId: string;
  itemsScraped: number;
  maxItems: number;
}

export interface DetailUserData {
  label: 'DETAIL';
  searchId: string;
  partial: PartialJob;
}

export interface CompanyUserData {
  label: 'COMPANY';
  companyKey: string;
}

export type UserData = SearchUserData | DetailUserData | CompanyUserData;

export interface PartialJob {
  id: string;
  positionName: string;
  company: string;
  companyUrl?: string;
  companyLogo?: string;
  location: string;
  remoteFlag?: boolean;
  workModel?: 'Remote' | 'Hybrid' | 'On-site' | undefined;
  salary?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: 'hour' | 'day' | 'week' | 'month' | 'year' | undefined;
  jobType?: string[];
  rating?: number;
  reviewsCount?: number;
  postedAt?: string;
  url: string;
  source: 'list' | 'detail';
}

export interface Job extends PartialJob {
  description?: string;
  descriptionHTML?: string;
  benefits?: string[];
  requirements?: string[];
  externalApplyLink?: string;
  isExpired?: boolean;
  scrapedAt: string;
  contentHash: string;
  companyDetails?: CompanyDetails;
}

export interface CompanyDetails {
  name: string;
  rating?: number;
  reviewsCount?: number;
  hq?: string;
  size?: string;
  industry?: string;
  founded?: string;
  url: string;
}
