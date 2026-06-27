import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.js";
import { styles } from "../styles.js";

// Active/inactive styling for the nav links. Module-scoped: it closes over
// nothing, so there's no reason to rebuild it each render.
const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  color: isActive ? "#4f46e5" : "#1f2937",
  fontWeight: isActive ? 700 : 500,
  textDecoration: "none",
});

// Shell for the authenticated screens: a top nav bar plus the routed <Outlet/>.
export function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <nav style={styles.nav}>
        <span style={styles.navBrand}>Acme CRM</span>
        <NavLink to="/dashboard" style={linkStyle}>
          Dashboard
        </NavLink>
        <NavLink to="/customers" style={linkStyle}>
          Customers
        </NavLink>
        <NavLink to="/deals/new" style={linkStyle}>
          New deal
        </NavLink>
        <NavLink to="/settings" style={linkStyle}>
          Settings
        </NavLink>
        <span style={styles.navSpacer} />
        <button
          type="button"
          style={styles.buttonGhost}
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          Log out
        </button>
      </nav>
      <main style={styles.page}>
        <Outlet />
      </main>
    </>
  );
}
