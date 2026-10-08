const form = document.querySelector("form") as HTMLFormElement;
const input = document.querySelector("input") as HTMLInputElement;
const output = document.querySelector("output") as HTMLOutputElement;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  output.textContent = "Pairing…";
  try {
    const response = await fetch("http://127.0.0.1:43117/api/v1/pairings/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: input.value, extensionId: chrome.runtime.id }) });
    const body = await response.json() as { token?: string; error?: { message?: string } };
    if (!response.ok || !body.token) throw new Error(body.error?.message ?? "Pairing failed");
    await chrome.storage.local.set({ filmboardToken: body.token });
    output.textContent = "Paired. New captures can transfer to FilmBoard.";
  } catch (error) { output.textContent = error instanceof Error ? error.message : "Pairing failed"; }
});
