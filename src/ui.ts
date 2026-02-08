import type { DocumentState } from "./state";

export interface UIElements {
  openButton: HTMLButtonElement;
  saveButton: HTMLButtonElement;
  saveAsButton: HTMLButtonElement;
  previewToggle: HTMLInputElement;
  alwaysOnTopToggle: HTMLInputElement;
  editor: HTMLTextAreaElement;
  preview: HTMLElement;
  status: HTMLElement;
  workspace: HTMLElement;
  unsavedDialog: HTMLDialogElement;
}

export type UnsavedChoice = "save" | "discard" | "cancel";

export function bindUI(): UIElements {
  const openButton = getElement<HTMLButtonElement>("open-btn");
  const saveButton = getElement<HTMLButtonElement>("save-btn");
  const saveAsButton = getElement<HTMLButtonElement>("save-as-btn");
  const previewToggle = getElement<HTMLInputElement>("preview-toggle");
  const alwaysOnTopToggle = getElement<HTMLInputElement>("always-on-top-toggle");
  const editor = getElement<HTMLTextAreaElement>("editor");
  const preview = getElement<HTMLElement>("preview");
  const status = getElement<HTMLElement>("status");
  const workspace = getElement<HTMLElement>("workspace");
  const unsavedDialog = getElement<HTMLDialogElement>("unsaved-dialog");

  return {
    openButton,
    saveButton,
    saveAsButton,
    previewToggle,
    alwaysOnTopToggle,
    editor,
    preview,
    status,
    workspace,
    unsavedDialog
  };
}

export function renderUI(state: DocumentState, ui: UIElements, previewHtml: string): void {
  if (ui.editor.value !== state.content) {
    ui.editor.value = state.content;
  }

  ui.preview.innerHTML = previewHtml;
  ui.preview.hidden = !state.previewOn;
  ui.workspace.dataset.preview = state.previewOn ? "on" : "off";

  ui.previewToggle.checked = state.previewOn;
  ui.alwaysOnTopToggle.checked = state.alwaysOnTop;

  const name = state.currentPath ? extractName(state.currentPath) : "Untitled.md";
  ui.status.textContent = `${state.currentPath ?? "Untitled.md"}${state.dirty ? " (unsaved)" : ""}`;
  document.title = `${state.dirty ? "* " : ""}${name} - Markdown Air`;
}

export function showUnsavedDialog(dialog: HTMLDialogElement): Promise<UnsavedChoice> {
  return new Promise<UnsavedChoice>((resolve) => {
    const onClose = (): void => {
      dialog.removeEventListener("close", onClose);
      const value = dialog.returnValue;
      if (value === "save" || value === "discard") {
        resolve(value);
        return;
      }
      resolve("cancel");
    };

    dialog.addEventListener("close", onClose);
    if (!dialog.open) {
      dialog.showModal();
    }
  });
}

export function showError(message: string): void {
  window.alert(message);
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: #${id}`);
  }
  return element as T;
}

function extractName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}
