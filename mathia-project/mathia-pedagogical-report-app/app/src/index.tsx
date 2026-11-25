import { render } from "solid-js/web";

import App from "./App";
import { I18nProvider } from "./lib/i18n";
import { AuthProvider } from "./stores/auth";
import "./styles.css";
// Load KaTeX's layout rules globally. Fractions rely on nested vlist elements.
import "katex/dist/katex.min.css";

const root = document.getElementById("root");

if (!root) throw new Error("Application root element was not found");

render(
  () => (
    <I18nProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </I18nProvider>
  ),
  root,
);
