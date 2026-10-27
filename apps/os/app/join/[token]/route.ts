import { invitationFragmentPath } from "../../../../../packages/authz/invitation-link";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return new Response(null, {
    status: 307,
    headers: {
      Location: invitationFragmentPath((await params).token),
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
