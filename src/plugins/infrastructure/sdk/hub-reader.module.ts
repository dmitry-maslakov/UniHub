import { Global, Module } from '@nestjs/common';
import { HubReader } from '@app/plugin-sdk';
import { StorageModule } from '../../../storage/contracts.js';
import { CoreHubReader } from './core-hub-reader.js';

// global because plugins inject HubReader and can't import hub modules
@Global()
@Module({
  imports: [StorageModule],
  providers: [{ provide: HubReader, useClass: CoreHubReader }],
  exports: [HubReader],
})
export class HubReaderModule {}
