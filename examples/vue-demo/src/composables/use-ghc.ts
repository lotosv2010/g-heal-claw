import {
  init,
  contextPlugin,
  breadcrumbPlugin,
  errorPlugin,
  httpPlugin,
  apiPlugin,
  performancePlugin,
  pageViewPlugin,
  resourcePlugin,
  customPlugin,
} from "@g-heal-claw/sdk";

export function initGhc(): void {
  init(
    {
      dsn: import.meta.env.VITE_GHC_DSN,
      environment: import.meta.env.VITE_GHC_ENV ?? "development",
      release: import.meta.env.VITE_GHC_RELEASE,
      debug: true,
    },
    {
      plugins: [
        contextPlugin(),
        breadcrumbPlugin(),
        errorPlugin(),
        httpPlugin({ codeFilter: (code: number) => code >= 400 }),
        apiPlugin({ slowThreshold: 2000 }),
        performancePlugin(),
        pageViewPlugin(),
        resourcePlugin(),
        customPlugin(),
      ],
    },
  );
}
