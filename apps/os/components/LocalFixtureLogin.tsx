export default function LocalFixtureLogin({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <details className="fixture-login">
      <summary>Local fixture identities</summary>
      <form action="/api/auth" method="post">
        <label>
          Synthetic identity
          <select name="fixture">
            <option value="owner">Owner — all seven projects</option>
            <option value="partner">Partner — seat covers only</option>
            <option value="viewer">Viewer — property only</option>
            <option value="revoked">Revoked account — access denied</option>
            <option value="invitee">Unassigned account — access denied</option>
          </select>
        </label>
        <p className="notice">
          Isolated local identities only. No cloud service or real credential is
          used.
        </p>
        <button>Use fixture</button>
      </form>
    </details>
  );
}
