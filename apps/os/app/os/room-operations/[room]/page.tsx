import Link from "next/link";
import { actor } from "../../../../lib/auth";
import { roomOperationRecovery } from "../../../../lib/room-operation-recovery";
import { RoomOperationRecovery } from "../../../../components/RoomOperationRecovery";
export default async function Page({
  params,
}: {
  params: Promise<{ room: string }>;
}) {
  try {
    const room = (await params).room,
      data = await roomOperationRecovery(await actor(), room);
    return (
      <main>
        <RoomOperationRecovery room={room} data={data} />
      </main>
    );
  } catch {
    return (
      <main>
        <h1>Room recovery unavailable</h1>
        <p>
          Complete sign-in, MFA and workspace access, then open a room you can
          access.
        </p>
        <Link href="/login">Sign in</Link>
      </main>
    );
  }
}
