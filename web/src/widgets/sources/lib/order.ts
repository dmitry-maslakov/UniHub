import type { Schemas } from '@/shared/api';

type Portal = Schemas['PortalResponse'];

const RANK: Record<Portal['mode'], number> = { token: 0, shared: 1, public: 2 };
const byLabel = new Intl.Collator('und', { numeric: true });

// Short sections first, so none sits under a long list: an account to
// link, then a word that there's nothing to do, then the catalogs; each
// kind by name
export const orderSources = (portals: readonly Portal[]) =>
  portals.toSorted(
    (a, b) => RANK[a.mode] - RANK[b.mode] || byLabel.compare(a.label, b.label),
  );
