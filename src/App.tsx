import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./components/AuthContext";
import Layout from "./components/Layout";
import Authorities from "./pages/Authorities";
import Dashboard from "./pages/Dashboard";
import Documents from "./pages/Documents";
import Family from "./pages/Family";
import Finance from "./pages/Finance";
import HomeItems from "./pages/HomeItems";
import Login from "./pages/Login";
import Tasks from "./pages/Tasks";
import Travel from "./pages/Travel";

export default function App() {
  const { session, ready } = useAuth();
  const [alertCount, setAlertCount] = useState(0);

  if (!ready) return <div className="auth"><p className="lede">Wird geladen …</p></div>;
  if (!session) return <Login />;

  return (
    <Routes>
      <Route element={<Layout alertCount={alertCount} />}>
        <Route index element={<Dashboard onCount={setAlertCount} />} />
        <Route path="family" element={<Family />} />
        <Route path="authorities" element={<Authorities />} />
        <Route path="authorities/:id" element={<Authorities />} />
        <Route path="finance" element={<Finance />} />
        <Route path="home-items" element={<HomeItems />} />
        <Route path="travel" element={<Travel />} />
        <Route path="travel/:id" element={<Travel />} />
        <Route path="documents" element={<Documents />} />
        <Route path="documents/:id" element={<Documents />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
