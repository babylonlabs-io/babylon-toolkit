import React from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { SimpleStakingApp } from "@services/simple-staking/src/embedded";
import { VaultApp } from "@services/vault/src/embedded";

function Header() {
    return (
        <header style={{ padding: 16, borderBottom: "1px solid #eee" }}>
            <nav style={{ display: "flex", gap: 12 }}>
                <Link to="/staking">Simple Staking</Link>
                <Link to="/vault">Vault</Link>
            </nav>
        </header>
    );
}

function Footer() {
    return (
        <footer style={{ padding: 16, borderTop: "1px solid #eee", marginTop: 32 }}>
            <small>© Babylon</small>
        </footer>
    );
}


export default function App(): React.JSX.Element {
    return (
        <div>
            <Header />
            <main>
                <Routes>
                    <Route path="/" element={<Navigate to="/staking" replace />} />
                    <Route path="/staking/*" element={<SimpleStakingApp />} />
                    <Route path="/vault/*" element={<VaultApp />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
            <Footer />
        </div>
    );
}


