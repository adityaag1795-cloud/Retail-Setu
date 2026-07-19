export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function qs<T extends Element = Element>(sel: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Element not found: ${sel}`);
  return el;
}

export function qsa<T extends Element = Element>(sel: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(sel));
}

export function toast(message: string, kind: "error" | "info" = "info") {
  const host = document.getElementById("toast-host");
  if (!host) return;
  const div = document.createElement("div");
  div.className = `toast toast--${kind}`;
  div.textContent = message;
  host.appendChild(div);
  setTimeout(() => div.remove(), 4500);
}

export function formToObject(form: HTMLFormElement): Record<string, string> {
  const data = new FormData(form);
  const out: Record<string, string> = {};
  for (const [k, v] of data.entries()) out[k] = String(v);
  return out;
}
