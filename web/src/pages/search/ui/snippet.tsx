import { Text } from '@mantine/core';
import type { Schemas } from '@/shared/api';
import { highlight } from '../lib/highlight';
import classes from './snippet.module.css';

// The index's text with the matched words marked. Plain text only, set as
// React text, whatever HTML the file had.
export function Snippet({ snippet }: { snippet: Schemas['SnippetResponse'] }) {
  return (
    <Text size="sm" c="dimmed" className={classes.snippet} lineClamp={3}>
      {highlight(snippet.text, snippet.highlights).map((part, i) =>
        part.match ? <mark key={i}>{part.text}</mark> : part.text,
      )}
    </Text>
  );
}
