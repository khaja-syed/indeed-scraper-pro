import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseSearchPage, parseSalaryRange, parseDescriptionHTML, contentHash } from '../src/parsers.js';

const here = dirname(fileURLToPath(import.meta.url));
const searchFixture = JSON.parse(readFileSync(join(here, 'fixtures/indeed-search.json'), 'utf8'));

describe('parseSearchPage', () => {
  const { jobs, nextStart, total } = parseSearchPage(searchFixture, 'www.indeed.com');

  it('extracts only well-formed jobs', () => {
    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.id)).toEqual(['abc123', 'def456']);
  });

  it('captures core fields, salary parsing, and work model', () => {
    const senior = jobs[0]!;
    expect(senior.positionName).toBe('Senior Software Engineer');
    expect(senior.company).toBe('Acme Corp');
    expect(senior.location).toBe('San Francisco, CA');
    expect(senior.workModel).toBe('Remote');
    expect(senior.remoteFlag).toBe(true);
    expect(senior.salaryMin).toBe(160000);
    expect(senior.salaryMax).toBe(200000);
    expect(senior.salaryCurrency).toBe('USD');
    expect(senior.salaryPeriod).toBe('year');
    expect(senior.url).toBe('https://www.indeed.com/viewjob?jk=abc123');
    expect(senior.companyUrl).toBe('https://www.indeed.com/cmp/Acme-Corp');
    expect(senior.rating).toBe(4.2);
    expect(senior.reviewsCount).toBe(1234);
  });

  it('falls back to estimatedSalary and HYBRID model', () => {
    const pm = jobs[1]!;
    expect(pm.salary).toBe('$130k - $170k a year');
    expect(pm.workModel).toBe('Hybrid');
    expect(pm.remoteFlag).toBeUndefined();
  });

  it('computes pagination cursor correctly', () => {
    expect(total).toBe(38);
    expect(nextStart).toBe(15);
  });
});

describe('parseSalaryRange', () => {
  it('handles US dollar ranges with period', () => {
    expect(parseSalaryRange('$50,000 - $70,000 a year')).toEqual({
      salaryMin: 50000,
      salaryMax: 70000,
      salaryCurrency: 'USD',
      salaryPeriod: 'year',
    });
  });

  it('handles GBP hourly rates', () => {
    const out = parseSalaryRange('£18.50 per hour');
    expect(out.salaryCurrency).toBe('GBP');
    expect(out.salaryPeriod).toBe('hour');
    expect(out.salaryMin).toBe(18.5);
  });

  it('returns empty for unparseable text', () => {
    expect(parseSalaryRange('Competitive')).toEqual({});
  });
});

describe('parseDescriptionHTML', () => {
  const descriptionHTML = readFileSync(join(here, 'fixtures/indeed-detail-description.html'), 'utf8');

  it('extracts plain-text description from real-shape HTML', () => {
    const out = parseDescriptionHTML({ descriptionHTML });
    expect(out.description).toContain('Senior Software Engineer');
    expect(out.description).toContain('TypeScript');
    expect(out.description.length).toBeGreaterThan(200);
    expect(out.descriptionHTML).toBe(descriptionHTML);
  });

  it('extracts requirements list from Requirements section', () => {
    const out = parseDescriptionHTML({ descriptionHTML });
    expect(out.requirements).toHaveLength(4);
    expect(out.requirements[0]).toMatch(/5\+ years/);
  });

  it('extracts benefits list from Benefits section', () => {
    const out = parseDescriptionHTML({ descriptionHTML });
    expect(out.benefits).toContain('401(k) with company match');
    expect(out.benefits).toContain('Unlimited PTO');
  });

  it('threads externalApplyLink and isExpired through unchanged', () => {
    const out = parseDescriptionHTML({
      descriptionHTML: '<div id="jobDescriptionText"><p>x</p></div>',
      externalApplyLink: 'https://acme.com/apply/abc',
      isExpired: true,
    });
    expect(out.externalApplyLink).toBe('https://acme.com/apply/abc');
    expect(out.isExpired).toBe(true);
  });

  it('returns empty arrays when sections are missing', () => {
    const out = parseDescriptionHTML({ descriptionHTML: '<p>Just a paragraph, no headers.</p>' });
    expect(out.requirements).toEqual([]);
    expect(out.benefits).toEqual([]);
  });

  it('decodes common HTML entities in description', () => {
    const out = parseDescriptionHTML({ descriptionHTML: '<p>Tom &amp; Jerry &nbsp; team</p>' });
    expect(out.description).toBe('Tom & Jerry team');
  });
});

describe('contentHash', () => {
  it('changes when salary changes', () => {
    const base = { positionName: 'SWE', company: 'Acme', location: 'SF', salary: '$100k' };
    const a = contentHash(base);
    const b = contentHash({ ...base, salary: '$120k' });
    expect(a).not.toBe(b);
  });
});
