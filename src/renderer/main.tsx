import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";

const rootNode = document.getElementById("root");
if (!rootNode) throw new Error("Application root node is missing.");

createRoot(rootNode).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
