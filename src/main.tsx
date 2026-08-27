import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./components/AuthContext";
import { DialogProvider } from "./components/Dialog";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./styles/app.css";

// GitHub Pages 404 fallback hand-off
const redirect = sessionStorage.getItem("ld_redirect");
if (redirect) {
  sessionStorage.removeItem("ld_redirect");
  history.replaceState(null, "", redirect);
}

const basename = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={basename || "/"}>
      <AuthProvider>
        <DialogProvider>
          <App />
        </DialogProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
