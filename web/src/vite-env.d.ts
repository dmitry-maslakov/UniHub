/// <reference types="vite/client" />

interface ImportMetaEnv {
  // the commit the image was built from (Dockerfile, COMMIT_SHA)
  readonly VITE_COMMIT_SHA?: string;
}
