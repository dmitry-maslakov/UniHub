import { PortalId } from '@app/kernel';
import { ITEM_CHANGED, ITEM_REMOVED } from '../events.js';
import { Item, type ItemProps } from './item.js';

const portal = PortalId.parse('canvas');
const ref = { portal, externalId: 'post-1' };
const props: ItemProps = {
  kind: 'announcement',
  title: 'Exam on Friday',
  url: null,
  publishedAt: new Date('2026-10-29T14:12:00Z'),
  raw: { guid: 'post-1', tags: ['exam'] },
};
const stored = () =>
  Item.restore({
    id: 'id-1',
    ref,
    props,
    portalCourseId: 'pc1',
    removedAt: null,
  });
const changed = { topic: ITEM_CHANGED, payload: { portal, itemId: 'id-1' } };

describe('Item', () => {
  it('is news for plugins when it is new', () => {
    const item = Item.create(ref, props, 'pc1');

    expect(item.dirty).toBe(true);
    expect(item.getUncommittedEvents()).toEqual([
      { topic: ITEM_CHANGED, payload: { portal, itemId: item.id } },
    ]);
  });

  it('takes what the portal sent again as no change', () => {
    const item = stored();

    expect(
      item.sync(
        // json keys in another order are the same json
        { ...props, raw: { tags: ['exam'], guid: 'post-1' } },
        'pc1',
      ),
    ).toBe(false);
    expect(item.dirty).toBe(false);
    expect(item.getUncommittedEvents()).toEqual([]);
  });

  it('is news when a field or its course changes', () => {
    for (const [next, course] of [
      [{ ...props, title: 'Exam moved' }, 'pc1'],
      [{ ...props, url: 'https://canvas/1' }, 'pc1'],
      [{ ...props, raw: { guid: 'post-1' } }, 'pc1'],
      [props, 'pc2'],
    ] as const) {
      const item = stored();
      expect(item.sync(next, course)).toBe(true);
      expect(item.getUncommittedEvents()).toEqual([changed]);
    }
  });

  it('is removed once, however often the portal says so', () => {
    const item = stored();

    expect(item.remove()).toBe(true);
    expect(item.remove()).toBe(false);
    expect(item.getUncommittedEvents()).toEqual([
      { topic: ITEM_REMOVED, payload: { portal, itemId: 'id-1' } },
    ]);
  });

  it('comes back when sent again, unchanged or not', () => {
    const item = stored();
    item.remove();
    item.uncommit();

    expect(item.sync(props, 'pc1')).toBe(true);
    expect(item.snapshot.removedAt).toBeNull();
    expect(item.getUncommittedEvents()).toEqual([changed]);
  });

  it('keeps a bare null in raw as json does', () => {
    const item = stored();
    expect(item.sync({ ...props, raw: null }, 'pc1')).toBe(true);
    expect(item.sync({ ...props, raw: null }, 'pc1')).toBe(false);
  });
});
