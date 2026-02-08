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
const DISABLE_CLOSE_GUARD =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?.VITE_DISABLE_CLOSE_GUARD === "1";
const CLOSE_LOG_PREFIX = "[close-guard]";
const CLOSE_GUARD_GLOBAL_KEY = "__markdownAirCloseGuard";

type CloseGuardGlobal = typeof globalThis & {
  __markdownAirCloseGuard?: {
    unlisten: (() => void) | null;
  };
};

const ui = bindUI();
const state = createInitialState(readSavedAlwaysOnTop());
const appWindow = getCurrentWindow();

let closeRequestInFlight = false;
let closeRequestedUnlisten: (() => void) | null = null;

const closeGuardGlobal = globalThis as CloseGuardGlobal;
if (!closeGuardGlobal[CLOSE_GUARD_GLOBAL_KEY]) {
  closeGuardGlobal[CLOSE_GUARD_GLOBAL_KEY] = { unlisten: null };
}

const closeGuardState = closeGuardGlobal[CLOSE_GUARD_GLOBAL_KEY];
const hot = (import.meta as ImportMeta & { hot?: { dispose(cb: () => void): void } }).hot;

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

  const unregisterCloseGuard = (reason: string): void => {
    if (!closeGuardState.unlisten) {
      return;
    }
    closeGuardState.unlisten();
    closeGuardState.unlisten = null;
    closeRequestedUnlisten = null;
    console.log(`${CLOSE_LOG_PREFIX} handler unregistered (${reason})`);
  };

  if (DISABLE_CLOSE_GUARD) {
    unregisterCloseGuard("kill-switch");
    console.log(`${CLOSE_LOG_PREFIX} handler registration skipped (VITE_DISABLE_CLOSE_GUARD=1)`);
    return;
  }

  unregisterCloseGuard("replace");
  console.log(`${CLOSE_LOG_PREFIX} handler registration active`);
  void appWindow
    .onCloseRequested(async (event) => {
    console.log(
      `${CLOSE_LOG_PREFIX} onCloseRequested fired: dirty=${state.dirty}, inFlight=${closeRequestInFlight}`
    );
    console.log(`${CLOSE_LOG_PREFIX} calling preventDefault() immediately`);
    event.preventDefault();

    if (closeRequestInFlight) {
      console.log(`${CLOSE_LOG_PREFIX} guard already inFlight=true; ignoring duplicate close request`);
      return;
    }

    closeRequestInFlight = true;
    console.log(`${CLOSE_LOG_PREFIX} unsaved flow started; inFlight=true`);
    try {
      let canClose = !state.dirty;
      if (canClose) {
        console.log(`${CLOSE_LOG_PREFIX} clean document; close is permitted`);
      } else {
        const decision = await showUnsavedDialog(ui.unsavedDialog);
        console.log(`${CLOSE_LOG_PREFIX} unsaved dialog decision=${decision}`);

        if (decision === "save") {
          const saved = await saveFile();
          console.log(`${CLOSE_LOG_PREFIX} save-on-close result=${saved}`);
          canClose = saved;
        } else {
          canClose = decision === "discard";
        }
      }

      console.log(`${CLOSE_LOG_PREFIX} confirm-close path executed=${canClose}`);
      if (!canClose) {
        console.log(`${CLOSE_LOG_PREFIX} close blocked by user choice or failed save`);
        return;
      }

      console.log(`${CLOSE_LOG_PREFIX} close permitted; scheduling appWindow.destroy()`);
      setTimeout(() => {
        console.log(`${CLOSE_LOG_PREFIX} executing deferred appWindow.destroy()`);
        void appWindow.destroy().catch((error) => {
          console.error(`${CLOSE_LOG_PREFIX} appWindow.destroy() failed: ${toMessage(error)}`);
        });
      }, 0);
    } finally {
      closeRequestInFlight = false;
      console.log(`${CLOSE_LOG_PREFIX} unsaved flow finished; inFlight=false`);
    }
  })
    .then((unlisten) => {
      closeRequestedUnlisten = unlisten;
      closeGuardState.unlisten = unlisten;
      console.log(`${CLOSE_LOG_PREFIX} handler registered`);
    })
    .catch((error) => {
      console.error(`${CLOSE_LOG_PREFIX} failed to register close handler: ${toMessage(error)}`);
    });

  hot?.dispose(() => {
    unregisterCloseGuard("hmr-dispose");
    closeRequestInFlight = false;
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
