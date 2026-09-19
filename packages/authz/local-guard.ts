export function localModeConfiguration(environment: NodeJS.ProcessEnv) {
  let loopbackOrigin = false;
  try {
    const origin = new URL(environment.KXRA_ORIGIN || "");
    const port = Number(origin.port);
    loopbackOrigin =
      origin.protocol === "http:" &&
      origin.hostname === "127.0.0.1" &&
      Number.isInteger(port) &&
      port >= 1024 &&
      port <= 65535 &&
      origin.username === "" &&
      origin.password === "" &&
      origin.pathname === "/" &&
      origin.search === "" &&
      origin.hash === "";
  } catch {
    loopbackOrigin = false;
  }
  return (
    environment.KXRA_AUTH_MODE === "fixture" &&
    environment.NODE_ENV === "development" &&
    !environment.VERCEL &&
    loopbackOrigin &&
    !environment.NEXT_PUBLIC_SUPABASE_URL &&
    !environment.DATABASE_URL &&
    !!environment.KXRA_RUNTIME &&
    typeof environment.KXRA_LOCAL_SECRET === "string" &&
    environment.KXRA_LOCAL_SECRET.length >= 64
  );
}
