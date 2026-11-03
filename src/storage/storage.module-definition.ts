import { ConfigurableModuleBuilder } from '@nestjs/common';

// only a local folder for now; s3 would be another BlobStore
export interface StorageOptions {
  location: string;
}

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<StorageOptions>()
    .setClassMethodName('forRoot')
    .build();
