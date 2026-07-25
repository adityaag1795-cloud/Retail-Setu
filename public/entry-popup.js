(() => {
  const STORAGE_KEY = "entryPopupDismissed";
  if (sessionStorage.getItem(STORAGE_KEY)) return;

  const popup = document.getElementById("entry-popup");
  if (!popup) return;

  function dismiss() {
    popup.hidden = true;
    document.body.style.overflow = "";
    sessionStorage.setItem(STORAGE_KEY, "1");
  }

  popup.querySelectorAll("[data-popup-dismiss]").forEach((el) => {
    el.addEventListener("click", dismiss);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !popup.hidden) dismiss();
  });

  popup.hidden = false;
  document.body.style.overflow = "hidden";
})();
