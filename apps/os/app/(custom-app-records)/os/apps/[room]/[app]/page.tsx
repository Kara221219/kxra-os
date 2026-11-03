import { actor } from "../../../../../../lib/auth";
import { customAppRecords } from "../../../../../../lib/custom-app-records";
import { CustomAppRecords } from "../../../../../../components/CustomAppRecords";
import { customAppRecordCopy } from "../../../../../../lib/custom-app-record-copy";
export default async function Page({
  params,
}: {
  params: Promise<{ room: string; app: string }>;
}) {
  try {
    const { room, app } = await params,
      data = await customAppRecords(await actor(), room, app);
    return (
      <main>
        <a href={`/os/custom-apps/${room}`}>App builder</a>
        <CustomAppRecords
          room={room}
          app={app}
          initial={data}
          copy={customAppRecordCopy}
        />
      </main>
    );
  } catch {
    return (
      <main>
        <h1>App unavailable</h1>
        <p>
          Use a synthetic fixture session and an accessible published local app.
        </p>
        <a href="/os/workspace">Rooms</a>
      </main>
    );
  }
}
