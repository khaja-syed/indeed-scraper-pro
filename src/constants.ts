import type { CountryCode } from './types.js';

export const DOMAIN_BY_COUNTRY: Record<CountryCode, string> = {
  US: 'www.indeed.com',
  GB: 'uk.indeed.com',
  CA: 'ca.indeed.com',
  AU: 'au.indeed.com',
  DE: 'de.indeed.com',
  FR: 'fr.indeed.com',
  NL: 'nl.indeed.com',
  IN: 'in.indeed.com',
  IE: 'ie.indeed.com',
  SG: 'sg.indeed.com',
  NZ: 'nz.indeed.com',
  ZA: 'za.indeed.com',
  AE: 'ae.indeed.com',
  JP: 'jp.indeed.com',
  BR: 'br.indeed.com',
  MX: 'mx.indeed.com',
  ES: 'es.indeed.com',
  IT: 'it.indeed.com',
  SE: 'se.indeed.com',
  CH: 'ch.indeed.com',
  BE: 'be.indeed.com',
  AT: 'at.indeed.com',
  DK: 'dk.indeed.com',
  FI: 'fi.indeed.com',
  NO: 'no.indeed.com',
  PL: 'pl.indeed.com',
  PT: 'pt.indeed.com',
};

export const RESULTS_PER_PAGE = 15;

export function buildSearchUrl(opts: { country: CountryCode; position?: string; location?: string; start?: number }): string {
  const domain = DOMAIN_BY_COUNTRY[opts.country];
  const params = new URLSearchParams();
  if (opts.position) params.set('q', opts.position);
  if (opts.location) params.set('l', opts.location);
  if (opts.start && opts.start > 0) params.set('start', String(opts.start));
  return `https://${domain}/jobs?${params.toString()}`;
}

export function buildDetailUrl(country: CountryCode, jobId: string): string {
  return `https://${DOMAIN_BY_COUNTRY[country]}/viewjob?jk=${encodeURIComponent(jobId)}`;
}
