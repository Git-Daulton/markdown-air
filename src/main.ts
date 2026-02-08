import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { renderMarkdown } from "./markdown";
import { createInitialState, markSaved, setEditorContent, setOpenedFile } from "./state";
import { bindUI, renderUI, showError, showUnsavedDialog } from "./ui";
import "./styles.css";

interface OpenFilePayload {
  path: string;
  content: string;
}

const ALWAYS_ON_TOP_STORAGE_KEY = "markdown-air.always-on-top";

const ui = bindUI();
const state = createInitialState(readSavedAlwaysOnTop());
const appWindow = getCurrentWindow();

let closeConfirmed = false;
let closeRequestInFlight = false;

bootstrap().catch((error) => {
  showError(`Failed to initialize app: ${toMessage(error)}`);
});

async function bootstrap(): Promise<void> {
  registerHandlers();
  await applyAlwaysOnTop(state.alwaysOnTop, false);
  refresh();
}

function registerHandlers(): void {
  ui.openButton.addEventListener("click", () => {
    void openFile();
  });
  ui.saveButton.addEventListener("click", () => {
    void saveFile();
  });
  ui.saveAsButton.addEventListener("click", () => {
    void saveFileAs();
  });
  ui.previewToggle.addEventListener("change", () => {
    state.previewOn = ui.previewToggle.checked;
    refresh();
  });
  ui.alwaysOnTopToggle.addEventListener("change", () => {
    void applyAlwaysOnTop(ui.alwaysOnTopToggle.checked);
  });
  ui.editor.addEventListener("input", () => {
    setEditorContent(state, ui.editor.value);
    refresh();
  });
  window.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "s") {
      event.preventDefault();
      if (event.shiftKey) {
        void saveFileAs();
        return;
      }
      void saveFile();
      return;
    }

    if (key === "o") {
      event.preventDefault();
      void openFile();
    }
  });

  void appWindow.onCloseRequested(async (event) => {
    if (closeConfirmed || !state.dirty) {
      return;
    }

    event.preventDefault();
    if (closeRequestInFlight) {
      return;
    }
    closeRequestInFlight = true;
    const decision = await showUnsavedDialog(ui.unsavedDialog);
    if (decision === "cancel") {
      closeRequestInFlight = false;
      return;
    }

    if (decision === "save") {
      const saved = await saveFile();
      if (!saved) {
        closeRequestInFlight = false;
        return;
      }
    }

    closeConfirmed = true;
    await appWindow.destroy();
  });
}

async function openFile(): Promise<void> {
  const canProceed = await resolveUnsavedChanges();
  if (!canProceed) {
    return;
  }

  try {
    const opened = await invoke<OpenFilePayload | null>("open_markdown_file");
    if (!opened) {
      return;
    }

    setOpenedFile(state, opened.path, opened.content);
    refresh();
  } catch (error) {
    showError(`Unable to open file: ${toMessage(error)}`);
  }
}

async function saveFile(): Promise<boolean> {
  try {
    if (!state.currentPath) {
      return await saveFileAs();
    }

    await invoke("save_markdown_file", {
      path: state.currentPath,
      content: state.content
    });
    markSaved(state);
    refresh();
    return true;
  } catch (error) {
    showError(`Unable to save file: ${toMessage(error)}`);
    return false;
  }
}

async function saveFileAs(): Promise<boolean> {
  try {
    const path = await invoke<string | null>("save_markdown_as", {
      content: state.content,
      suggestedPath: state.currentPath
    });
    if (!path) {
      return false;
    }

    state.currentPath = path;
    markSaved(state);
    refresh();
    return true;
  } catch (error) {
    showError(`Unable to save file: ${toMessage(error)}`);
    return false;
  }
}

async function applyAlwaysOnTop(enabled: boolean, showAlerts = true): Promise<void> {
  try {
    await invoke("set_always_on_top", { enabled });
    state.alwaysOnTop = enabled;
    localStorage.setItem(ALWAYS_ON_TOP_STORAGE_KEY, String(enabled));
    refresh();
  } catch (error) {
    ui.alwaysOnTopToggle.checked = state.alwaysOnTop;
    if (showAlerts) {
      showError(`Unable to change always-on-top setting: ${toMessage(error)}`);
    }
  }
}

async function resolveUnsavedChanges(): Promise<boolean> {
  if (!state.dirty) {
    return true;
  }

  const decision = await showUnsavedDialog(ui.unsavedDialog);
  if (decision === "cancel") {
    return false;
  }
  if (decision === "discard") {
    return true;
  }

  return await saveFile();
}

function refresh(): void {
  renderUI(state, ui, renderMarkdown(state.content));
}

function readSavedAlwaysOnTop(): boolean {
  return localStorage.getItem(ALWAYS_ON_TOP_STORAGE_KEY) === "true";
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
