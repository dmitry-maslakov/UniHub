import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { pageHeaders } from './page-headers.js';
import { webConfig } from './web.config.js';

// The web app at /, on the API's own origin, so Better Auth's cookies need
// no CORS. Any other path is the app's (index.html, its router takes it
// from there) but the API's, the documents under /.well-known and a file
// of the build that isn't there, which are a 404. It holds no rules and
// uses no other module: the browser talks to them over HTTP. Its routes
// come after the controllers' (serve-static registers on init), so it
// never takes theirs.
@Module({
  imports: [
    ServeStaticModule.forRootAsync({
      imports: [ConfigModule.forFeature(webConfig)],
      inject: [webConfig.KEY],
      useFactory: ({ root }: ConfigType<typeof webConfig>) => [
        {
          rootPath: root,
          exclude: ['/api/{*path}', '/.well-known/{*path}', '/assets/{*path}'],
          serveStaticOptions: { setHeaders: pageHeaders(root) },
        },
      ],
    }),
  ],
})
export class WebModule {}
