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

// a portal's id ('canvas', 'acs'): which connector writes its records
export const PortalId = name.brand<'PortalId'>();
export type PortalId = z.output<typeof PortalId>;

export const PluginName = name.brand<'PluginName'>();
export type PluginName = z.output<typeof PluginName>;
