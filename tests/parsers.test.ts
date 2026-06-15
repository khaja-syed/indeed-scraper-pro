import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseSearchPage, parseSalaryRange, parseDetailJson, contentHash } from '../src/parsers.js';

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

describe('parseDetailJson', () => {
  it('extracts description, benefits, and apply link', () => {
    const out = parseDetailJson({
      jobInfoWrapperModel: {
        jobInfoModel: {
          sanitizedJobDescription: '<p>Build great software. Requirements: 5+ years TS.</p>',
          jobDescriptionSectionModel: { html: '<p>Build great software.</p>' },
          benefitsModel: { benefits: [{ label: '401k' }, { label: 'Health' }] },
        },
      },
      hostQueryExecutionResult: {
        data: { jobData: { results: [{ job: { applyButtonLink: 'https://acme.com/apply/abc' } }] } },
      },
      expired: false,
    });
    expect(out.description).toContain('Build great software');
    expect(out.benefits).toEqual(['401k', 'Health']);
    expect(out.externalApplyLink).toBe('https://acme.com/apply/abc');
    expect(out.isExpired).toBe(false);
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
