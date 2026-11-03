import Link from "next/link";
import { actor } from "../../../../../lib/auth";
import { customApps } from "../../../../../lib/custom-apps";
import { CustomApps } from "../../../../../components/CustomApps";
export default async function Page({
  params,
}: {
  params: Promise<{ room: string }>;
}) {
  try {
    const room = (await params).room,
      data = await customApps(await actor(), room);
    return (
      <main>
        <Link href={`/os/workspace?room=${room}`}>Back to room</Link>
        <CustomApps
          room={room}
          initialApps={data.apps}
          canManage={data.can_manage}
        />
      </main>
    );
  } catch {
    return (
      <main>
        <h1>Local custom apps unavailable</h1>
        <p>
          Use a synthetic fixture session and an accessible room after
          installing the local custom-app fixture extension.
        </p>
        <Link href="/os/workspace">Rooms</Link>
      </main>
    );
  }
}
