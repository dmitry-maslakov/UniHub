import { MIMEType } from 'node:util';
import { z } from 'zod';

// Values that went through a check, as zod brands: a ContentHash is a
// string, but a string is not a ContentHash until ContentHash.parse said so.
// Brands survive JSON (job data, outbox payloads), classes wouldn't.

// sha256 of some content, in lower-case hex: the key content is stored and
// processed under, and safe as a file name
export const ContentHash = z
  .string()
  .toLowerCase()
  .regex(/^[0-9a-f]{64}$/, 'not a sha256 in hex')
  .brand<'ContentHash'>();
export type ContentHash = z.output<typeof ContentHash>;

// A media type's essence: 'Application/PDF; charset=binary' is
// 'application/pdf'. A portal's type is only a hint, so callers usually
// take safeParse(...).data and treat what isn't one as unknown.
export const MediaType = z
  .string()
  .transform((value, ctx) => {
    try {
      return new MIMEType(value).essence;
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'not a media type',
        input: value,
      });
      return z.NEVER;
    }
  })
  .brand<'MediaType'>();
export type MediaType = z.output<typeof MediaType>;

// Portal ids and plugin names end up in keys and job ids joined with '__'
// and ':', so lower-case letters, digits and dashes only.
const name = z
  .string()
  .regex(/^[a-z0-9-]+$/, 'lower-case letters, digits and dashes only');

// a portal's id ('canvas', 'moodle'): which connector writes its records
export const PortalId = name.brand<'PortalId'>();
export type PortalId = z.output<typeof PortalId>;

export const PluginName = name.brand<'PluginName'>();
export type PluginName = z.output<typeof PluginName>;

// Where a portal's records and accounts come from, when the portal is a
// product each school runs on a site of its own (Canvas): the site's
// origin, https and a DNS name in lower case, with no port (443), path or
// userinfo, and never an IP literal. The address of any page of it gives
// it, its scheme left out too: 'Canvas.Example.edu/courses/1' is
// 'https://canvas.example.edu'.
export const Instance = z
  .string()
  .trim()
  .transform((value) =>
    /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`,
  )
  .pipe(z.url({ protocol: /^https$/, hostname: z.regexes.domain }))
  .transform((value, ctx) => {
    const url = new URL(value);
    if (url.port || url.username || url.password) {
      ctx.addIssue({
        code: 'custom',
        message: 'an https address with no port and no user in it',
        input: value,
      });
      return z.NEVER;
    }
    return url.origin;
  })
  .brand<'Instance'>();
export type Instance = z.output<typeof Instance>;

// what a record or an account of a portal that is one site carries (a gRPC
// portal's): no instance
export const NO_INSTANCE = '' as Instance;

// How a portal's accounts are linked (README, Portal accounts): `shared`,
// the one account its plugin's settings give, read by whoever an admin lets
// read its courses; `token`, each user's own, by a token they paste;
// `public`, the one account of a site anyone may read, each user reading
// the courses they pick from its catalog
export const LinkMode = z.enum(['shared', 'token', 'public']);
export type LinkMode = z.output<typeof LinkMode>;

// the account a shared or public portal is read by, the one its plugin's
// settings give: what catalog keeps as everyone's view of it, and readers
// read
export const SHARED_ACCOUNT = 'shared';

// a mode a user links an account of their own by: neither shared nor
// public, which read the portal's one account
export const AccountLink = LinkMode.exclude(['shared', 'public']);
export type AccountLink = z.output<typeof AccountLink>;
