import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { getToken } from "./lib/auth";

// Set API base URL for API client
const apiUrl = import.meta.env.VITE_API_URL || "";
if (apiUrl) {
  setBaseUrl(apiUrl);
}

setAuthTokenGetter(() => getToken());

createRoot(document.getElementById("root")!).render(<App />);
