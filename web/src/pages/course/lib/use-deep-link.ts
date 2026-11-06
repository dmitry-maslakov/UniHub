import { useLocation } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

const MAX_PAGES = 20;

// A link to one post or file (`#item-<id>`, from search) lands on it: once
// it's loaded, scrolled to; while it isn't, the next pages are fetched, up
// to MAX_PAGES. `prefix` says whose ids are these ('item-' or 'file-').
export function useDeepLink(
  prefix: string,
  ids: string[],
  list: {
    isSuccess: boolean;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => unknown;
    pages: number;
  },
) {
  const hash = useLocation({ select: (l) => l.hash });
  const target = hash.startsWith(prefix) ? hash : undefined;
  const present = !!target && ids.includes(target.slice(prefix.length));
  const scrolled = useRef<string>(undefined);
  const { isSuccess, hasNextPage, isFetchingNextPage, fetchNextPage, pages } =
    list;

  useEffect(() => {
    if (!target || !isSuccess) return;
    if (present) {
      if (scrolled.current === target) return;
      scrolled.current = target;
      document.getElementById(target)?.scrollIntoView();
    } else if (hasNextPage && !isFetchingNextPage && pages < MAX_PAGES) {
      void fetchNextPage();
    }
  }, [
    target,
    present,
    isSuccess,
    hasNextPage,
    isFetchingNextPage,
    pages,
    fetchNextPage,
  ]);
}
