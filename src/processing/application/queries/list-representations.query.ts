import { Query } from '@nestjs/cqrs';

export interface RepresentationDto {
  processor: string;
  version: number;
  // pages, slides or sections
  parts: string[];
}

// what processors made of some content, the newest version of each
export class ListRepresentationsQuery extends Query<RepresentationDto[]> {
  constructor(public readonly hash: string) {
    super();
  }
}
