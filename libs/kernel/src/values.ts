import { MIMEType } from 'node:util';
import type { Brand } from './brand.js';
import { InvalidValueError } from './errors.js';

// sha256 of some content, in lower-case hex: the key content is stored and
// processed under, and safe as a file name
export type ContentHash = Brand<string, 'ContentHash'>;
export const ContentHash = {
  parse(value: string): ContentHash {
    const hash = value.toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hash))
      throw new InvalidValueError('content hash', value);
    return hash as ContentHash;
  },
};

// A media type's essence: 'Application/PDF; charset=binary' is
// 'application/pdf'. A portal's type is a hint, not a promise, so what
// isn't one is null rather than an error.
export type MediaType = Brand<string, 'MediaType'>;
export const MediaType = {
  parse(value: string): MediaType | null {
    try {
      return new MIMEType(value).essence as MediaType;
    } catch {
      return null;
    }
  },
};

// Portal ids and plugin names end up in keys and job ids joined with '__'
// and ':', so lower-case letters, digits and dashes only.
const NAME = /^[a-z0-9-]+$/;
const name = <T extends string>(what: string) => ({
  isValid: (value: string) => NAME.test(value),
  parse(value: string): T {
    if (!NAME.test(value)) throw new InvalidValueError(what, value);
    return value as T;
  },
});

// a portal's id ('canvas', 'acs'): which connector writes its records
export type PortalId = Brand<string, 'PortalId'>;
export const PortalId = name<PortalId>('portal id');

export type PluginName = Brand<string, 'PluginName'>;
export const PluginName = name<PluginName>('plugin name');
