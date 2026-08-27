import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./components/AuthContext";
import { DialogProvider } from "./components/Dialog";
import { ThemeProvider } from "./components/ThemeContext";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./styles/app.css";

// GitHub Pages 404 fallback hand-off
const redirect = sessionStorage.getItem("ld_redirect");
if (redirect) {
  sessionStorage.removeItem("ld_redirect");
  history.replaceState(null, "", redirect);
}

const basename = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

try {
  const storedTheme = localStorage.getItem("ld_theme");
  if (storedTheme === "light" || storedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", storedTheme);
  }
} catch {
  // ignore storage access failures
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter basename={basename || "/"}>
        <AuthProvider>
          <DialogProvider>
            <App />
          </DialogProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);
