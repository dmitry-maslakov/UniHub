import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { postStrings, postText } from '../domain/post-text.js';
import { GetPostTextQuery } from './queries.js';
import { HtmlText } from './ports.js';

// What a post's page reads, the way search reads it: its strings as HTML
// made plain, each said once. The title is the page's heading, so the body
// leaves it out.
@QueryHandler(GetPostTextQuery)
export class PostTextHandler implements IQueryHandler<GetPostTextQuery> {
  constructor(private readonly html: HtmlText) {}

  async execute({ raw }: GetPostTextQuery) {
    return postText(await this.html.textsOf(postStrings({ title: null, raw })));
  }
}
