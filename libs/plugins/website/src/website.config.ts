import { load } from 'cheerio';
import { z } from 'zod';
import { Instance, settings } from '@app/plugin-sdk';

const unset = (v: unknown) => (v === '' ? undefined : v);

const regex = (flags = '') =>
  z
    .string()
    .min(1)
    .refine((source) => {
      try {
        new RegExp(source, flags);
        return true;
      } catch {
        return false;
      }
    }, 'not a regular expression')
    .transform((source) => new RegExp(source, flags));

const selector = z
  .string()
  .min(1)
  .refine((css) => {
    try {
      load('<p></p>')(css);
      return true;
    } catch {
      return false;
    }
  }, 'not a CSS selector');

// one part of the site, a course of the catalog users pick from
const Section = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  // a path on the site: /sitemap.xml
  sitemap: z.string().regex(/^\/\S*$/, 'a path starting with /'),
  // both test a page's pathname
  include: regex().optional(),
  exclude: regex().optional(),
  // where on the page its text is
  content: selector.default('main'),
  kind: z.string().min(1).default('page'),
  // read the .pdf and .docx documents the pages link, as files
  files: z.boolean().default(false),
  // tests a document's pathname and its link text
  skipFiles: regex('i').optional(),
  // read a page again after this many days, whatever its sitemap says
  revisitDays: z.number().int().positive().optional(),
});
export type Section = z.output<typeof Section>;

const parseJson = (text: string, ctx: z.RefinementCtx) => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    ctx.issues.push({ code: 'custom', message: 'not JSON', input: text });
    return z.NEVER;
  }
};

const Sections = z
  .array(Section)
  .min(1)
  .refine((all) => new Set(all.map((s) => s.id)).size === all.length, {
    message: 'section ids repeat',
  });

export const websiteSettings = z
  .object({
    // the site: https://faculty.example.edu, read through its sitemaps
    WEBSITE_URL: Instance,
    // a JSON array of the parts of it to read, each a course of the catalog
    WEBSITE_SECTIONS: z.string().transform(parseJson).pipe(Sections),
    // names neither the hub nor whoever runs it
    WEBSITE_USER_AGENT: z.string().min(1).default('course-sync'),
    // between any two requests
    WEBSITE_DELAY_MS: z.preprocess(
      unset,
      z.coerce.number().int().min(0).default(1000),
    ),
    // per run; the next one goes on from what this left
    WEBSITE_MAX_REQUESTS: z.preprocess(
      unset,
      z.coerce.number().int().positive().default(900),
    ),
  })
  .transform((env) => ({
    url: env.WEBSITE_URL,
    sections: env.WEBSITE_SECTIONS,
    userAgent: env.WEBSITE_USER_AGENT,
    delayMs: env.WEBSITE_DELAY_MS,
    maxRequests: env.WEBSITE_MAX_REQUESTS,
  }));

// read once the plugin is on
export const websiteConfig = settings('website', websiteSettings);
