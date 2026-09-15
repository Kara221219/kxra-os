export function localModeConfiguration(environment: NodeJS.ProcessEnv) {
  return (
    environment.KXRA_AUTH_MODE === "fixture" &&
    environment.NODE_ENV === "development" &&
    !environment.VERCEL &&
    environment.KXRA_ORIGIN === "http://127.0.0.1:3210" &&
    !environment.NEXT_PUBLIC_SUPABASE_URL &&
    !environment.DATABASE_URL &&
    !!environment.KXRA_RUNTIME &&
    typeof environment.KXRA_LOCAL_SECRET === "string" &&
    environment.KXRA_LOCAL_SECRET.length >= 64
  );
}
