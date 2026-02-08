export interface DocumentState {
  currentPath: string | null;
  content: string;
  savedContent: string;
  dirty: boolean;
  previewOn: boolean;
  alwaysOnTop: boolean;
}

export function createInitialState(alwaysOnTop: boolean): DocumentState {
  return {
    currentPath: null,
    content: "",
    savedContent: "",
    dirty: false,
    previewOn: false,
    alwaysOnTop
  };
}

export function setEditorContent(state: DocumentState, nextContent: string): void {
  state.content = nextContent;
  state.dirty = state.content !== state.savedContent;
}

export function setOpenedFile(
  state: DocumentState,
  nextPath: string,
  nextContent: string
): void {
  state.currentPath = nextPath;
  state.content = nextContent;
  state.savedContent = nextContent;
  state.dirty = false;
}

export function markSaved(state: DocumentState): void {
  state.savedContent = state.content;
  state.dirty = false;
}
