import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
export const nativeFixtureLock = "/tmp/kxra-native-serial.lock";
export function acquireNativeFixtureLock(file = nativeFixtureLock) {
  const release = acquireNativeFixtureLease("customer-connectors", file);
  return (confirmed = true) => {
    if (!confirmed) throw Error(`FIXTURE_CLEANUP_UNCERTAIN: retained ${file}`);
    release();
  };
}
