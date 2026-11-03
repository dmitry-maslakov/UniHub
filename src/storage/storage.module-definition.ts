import { ConfigurableModuleBuilder } from '@nestjs/common';

// only a local folder for now, s3/r2 is another flydrive driver
export interface StorageOptions {
  driver: 'fs';
  location: string;
}

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<StorageOptions>()
    .setClassMethodName('forRoot')
    .build();
