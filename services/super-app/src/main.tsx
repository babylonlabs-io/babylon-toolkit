import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { SuperApp } from "./super-app.tsx";
import "./index.css";
import "@services/simple-staking/src/ui/globals.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root container not found");

createRoot(container).render(
    <StrictMode>
        <BrowserRouter>
            <SuperApp />
        </BrowserRouter>
    </StrictMode>,
);


