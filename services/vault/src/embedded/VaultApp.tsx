import React, { useEffect } from "react";
import { useLocation } from "react-router";

export function VaultApp(): React.JSX.Element {
    const location = useLocation();
    useEffect(() => {
        document.title = "Babylon - Vault";
    }, [location.pathname]);

    return (
        <div style={{ margin: "auto", textAlign: "center" }}>
            <h1>Vault</h1>
            <p>Coming soon</p>
        </div>
    );
}


