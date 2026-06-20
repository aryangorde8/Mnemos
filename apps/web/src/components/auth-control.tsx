import { useAuth } from "@/lib/auth";

/**
 * Minimal sign-in/out affordance, fixed to the top-right. Renders nothing when
 * Firebase isn't configured (the app runs open in that case).
 */
export function AuthControl() {
  const { configured, loading, user, signIn, signOut } = useAuth();

  if (!configured) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontFamily: "var(--font-mono-loaded, monospace)",
        fontSize: 12,
      }}
    >
      {loading ? null : user ? (
        <>
          <span style={{ color: "#b9ad99", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.email ?? user.displayName ?? "signed in"}
          </span>
          <button
            onClick={() => void signOut()}
            style={pillStyle}
          >
            sign out
          </button>
        </>
      ) : (
        <button onClick={() => void signIn()} style={{ ...pillStyle, color: "#f25738", borderColor: "rgba(242,87,56,0.4)" }}>
          sign in
        </button>
      )}
    </div>
  );
}

const pillStyle: React.CSSProperties = {
  background: "rgba(20,16,10,0.7)",
  color: "#f3ecdf",
  border: "1px solid rgba(243,236,223,0.18)",
  borderRadius: 999,
  padding: "5px 12px",
  cursor: "pointer",
  backdropFilter: "blur(8px)",
};
