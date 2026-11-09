import { Image, Skeleton, Text } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// A file as the hub draws it (an image, or a page of a PDF): a skeleton
// until it is in. Keyed by its address by the caller, so a page that follows
// starts again.
export function ViewImage({ src, alt }: { src: string; alt: string }) {
  const { t } = useTranslation('file');
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>(
    'loading',
  );

  if (state === 'failed')
    return (
      <Text size="sm" c="dimmed">
        {t('view.failed')}
      </Text>
    );
  return (
    <Skeleton
      visible={state === 'loading'}
      mih={state === 'loading' ? 320 : undefined}
    >
      <Image
        src={src}
        alt={alt}
        fit="contain"
        w="100%"
        mah="70vh"
        onLoad={() => setState('loaded')}
        onError={() => setState('failed')}
      />
    </Skeleton>
  );
}
