import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import "./i18n";
import "./app/styles.css";

/**
 * Mount the React application.
 */
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
