import { Module } from '@nestjs/common';
import { HtmlText } from '../application/ports.js';
import { OfficeParserHtmlText } from './search/officeparser-html-text.js';

// HTML as plain text, for a post's page and for search alike: its own
// module, so the processing module and the search module (which can't import
// each other) share one, and a post reads with search off
@Module({
  providers: [{ provide: HtmlText, useClass: OfficeParserHtmlText }],
  exports: [HtmlText],
})
export class HtmlTextModule {}
