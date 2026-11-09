import { Anchor, Image, Skeleton } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/shared/ui';

// A file as the hub draws it (an image, or a page of a PDF): a skeleton
// until it is in, the way to the full picture, and a retry if it fails.
// Keyed by its address by the caller, so a page that follows starts again.
// A page of a PDF (`paged`) fills the column, since its small print is the
// point, and holds the room of a page while it loads so paging doesn't
// move what is below.
export function ViewImage({
  src,
  alt,
  paged = false,
}: {
  src: string;
  alt: string;
  paged?: boolean;
}) {
  const { t } = useTranslation('file');
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>(
    'loading',
  );
  const [attempt, setAttempt] = useState(0);

  if (state === 'failed')
    return (
      <ErrorState
        error={new Error(t('view.failed'))}
        onRetry={() => {
          setAttempt(attempt + 1);
          setState('loading');
        }}
      />
    );
  return (
    <Skeleton
      visible={state === 'loading'}
      role={state === 'loading' ? 'status' : undefined}
      aria-label={state === 'loading' ? t('view.loading') : undefined}
      mih={state === 'loading' ? (paged ? 900 : 320) : undefined}
    >
      <Anchor
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('view.full', { name: alt })}
        display="block"
      >
        <Image
          key={attempt}
          src={src}
          alt={alt}
          fit="contain"
          w="100%"
          mah={paged ? undefined : '70vh'}
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
        />
      </Anchor>
    </Skeleton>
  );
}
