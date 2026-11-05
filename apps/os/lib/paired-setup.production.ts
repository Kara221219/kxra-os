export async function pairedSetupRoute(_request: Request) {
  return Response.json(
    { error: "PAIRED_SETUP_DISABLED" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
export async function pairedSetupPageData() {
  return null;
}
