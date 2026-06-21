// Typed re-exports of the build-time version constants so UI imports a constant
// rather than touching the injected globals (declared in src/global.d.ts).
export const APP_VERSION = __APP_VERSION__;
export const BUILD_DATE = __BUILD_DATE__;
