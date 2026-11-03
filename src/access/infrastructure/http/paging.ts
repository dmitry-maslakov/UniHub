import {
  applyDecorators,
  BadRequestException,
  DefaultValuePipe,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import type { Page } from '../../application/course-reader.js';

export const MAX_LIMIT = 200;

export const Offset = () =>
  Query('offset', new DefaultValuePipe(0), ParseIntPipe);
export const Limit = () =>
  Query('limit', new DefaultValuePipe(50), ParseIntPipe);

export function page(offset: number, limit: number): Page {
  if (offset < 0 || limit < 1 || limit > MAX_LIMIT)
    throw new BadRequestException(
      `offset is 0 or more, limit from 1 to ${MAX_LIMIT}`,
    );
  return { offset, limit };
}

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
