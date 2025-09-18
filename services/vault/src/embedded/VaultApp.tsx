import React, { useEffect } from "react";

export function VaultApp(): React.JSX.Element {
    useEffect(() => {
        document.title = "Babylon - Vault";
    }, []);

    return (
        <div style={{ margin: "auto", textAlign: "center" }}>
            <h1>Vault</h1>
            <p>Coming soon</p>
        </div>
    );
}


