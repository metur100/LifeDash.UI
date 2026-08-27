import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./components/AuthContext";
import Layout from "./components/Layout";
import Authorities from "./pages/Authorities";
import Dashboard from "./pages/Dashboard";
import Documents from "./pages/Documents";
import Family from "./pages/Family";
import Finance from "./pages/Finance";
import Login from "./pages/Login";
import Tasks from "./pages/Tasks";
import Travel from "./pages/Travel";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";

export default function App() {
  const { session, ready } = useAuth();
  const [alertCount, setAlertCount] = useState(0);

  if (!ready) return <div className="auth"><p className="lede">Wird geladen …</p></div>;

  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />

      {session ? (
        <Route element={<Layout alertCount={alertCount} />}>
          <Route index element={<Dashboard onCount={setAlertCount} />} />
          <Route path="family" element={<Family />} />
          <Route path="authorities" element={<Authorities />} />
          <Route path="authorities/:id" element={<Authorities />} />
          <Route path="finance" element={<Finance />} />
          <Route path="travel" element={<Travel />} />
          <Route path="travel/:id" element={<Travel />} />
          <Route path="documents" element={<Documents />} />
          <Route path="documents/:id" element={<Documents />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      ) : (
        <Route path="*" element={<Login />} />
      )}
    </Routes>
  );
}
