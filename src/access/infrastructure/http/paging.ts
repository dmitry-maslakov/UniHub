import {
  applyDecorators,
  Query,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { MAX_LIMIT, MAX_OFFSET } from '../../application/course-reader.js';

const int = (min: number, max: number, byDefault: number) => ({
  schema: z.coerce.number().int().min(min).max(max).default(byDefault),
  pipes: [StandardSchemaValidationPipe],
});

export const Offset = () => Query('offset', int(0, MAX_OFFSET, 0));
export const Limit = () => Query('limit', int(1, MAX_LIMIT, 50));
export const PageNumber = () => Query('page', int(1, MAX_OFFSET, 1));

// the two parameters as OpenAPI sees them
export const Paged = () =>
  applyDecorators(
    ApiQuery({ name: 'offset', required: false, type: Number }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      description: `1 to ${MAX_LIMIT}, 50 by default`,
    }),
  );
