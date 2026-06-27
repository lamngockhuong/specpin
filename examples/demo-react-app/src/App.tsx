import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { RequireAuth } from "./components/RequireAuth.js";
import { CustomerDetail } from "./screens/CustomerDetail.js";
import { Customers } from "./screens/Customers.js";
import { Dashboard } from "./screens/Dashboard.js";
import { Login } from "./screens/Login.js";
import { NewDeal } from "./screens/NewDeal.js";
import { Settings } from "./screens/Settings.js";

// Route table for the demo. `/login` is public; everything else lives behind the
// in-memory auth gate under the shared <Layout/> shell.
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/deals/new" element={<NewDeal />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
