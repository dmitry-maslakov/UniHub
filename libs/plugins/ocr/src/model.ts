import { Logger } from '@nestjs/common';
import { ModelUnavailableError, type ProcessorInput } from '@app/plugin-sdk';
import { z } from 'zod';

// one picture gets this long from the model
export const PICTURE_TIMEOUT_MS = 10 * 60_000;

const answer = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullish() }) }))
    .min(1),
});

export interface Question {
  prompt: string;
  // the order of the two in the message's content
  imageFirst: boolean;
  maxTokens: number;
}

// One picture put to an OpenAI-compatible server (llama.cpp's, say) taking
// images: the text it answers, trimmed, or '' for nothing. A server that
// can't be reached or is still loading (5xx) is ModelUnavailableError, so
// the queue waits; the input's abort is rethrown. The picture's own fault is
// '' and a warning: it took over 10 minutes or the server refused it (4xx).
export async function ask(
  url: string,
  question: Question,
  jpeg: Buffer,
  input: ProcessorInput,
  logger: Logger,
) {
  const image = {
    type: 'image_url',
    image_url: { url: `data:image/jpeg;base64,${jpeg.toString('base64')}` },
  };
  const text = { type: 'text', text: question.prompt };
  const signals = [AbortSignal.timeout(PICTURE_TIMEOUT_MS)];
  if (input.signal) signals.unshift(input.signal);
  let response: Response;
  try {
    response = await fetch(`${url.replace(/\/+$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: question.imageFirst ? [image, text] : [text, image],
          },
        ],
        max_tokens: question.maxTokens,
        temperature: 0,
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: AbortSignal.any(signals),
    });
  } catch (error) {
    if (input.signal?.aborted) throw input.signal.reason;
    if (error instanceof Error && error.name === 'TimeoutError') {
      logger.warn(`${input.name}: a picture got no answer in time`);
      return '';
    }
    // refused, not found, reset: the model isn't there
    throw new ModelUnavailableError('the model can not be reached', {
      cause: error,
    });
  }
  if (response.status >= 500) {
    await response.body?.cancel();
    throw new ModelUnavailableError(`the model answered ${response.status}`);
  }
  if (!response.ok) {
    await response.body?.cancel();
    logger.warn(
      `${input.name}: the model refused a picture (${response.status})`,
    );
    return '';
  }
  try {
    const { choices } = answer.parse(await response.json());
    return (choices[0].message.content ?? '').trim();
  } catch (error) {
    if (input.signal?.aborted) throw input.signal.reason;
    if (error instanceof Error && error.name === 'TimeoutError') {
      logger.warn(`${input.name}: a picture got no answer in time`);
      return '';
    }
    logger.warn(`${input.name}: the model's answer can't be read`);
    return '';
  }
}
