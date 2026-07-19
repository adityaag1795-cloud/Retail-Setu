export function escapeHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
export function qs(sel, root = document) {
    const el = root.querySelector(sel);
    if (!el)
        throw new Error(`Element not found: ${sel}`);
    return el;
}
export function qsa(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
}
export function toast(message, kind = "info") {
    const host = document.getElementById("toast-host");
    if (!host)
        return;
    const div = document.createElement("div");
    div.className = `toast toast--${kind}`;
    div.textContent = message;
    host.appendChild(div);
    setTimeout(() => div.remove(), 4500);
}
export function formToObject(form) {
    const data = new FormData(form);
    const out = {};
    for (const [k, v] of data.entries())
        out[k] = String(v);
    return out;
}
//# sourceMappingURL=dom.js.map