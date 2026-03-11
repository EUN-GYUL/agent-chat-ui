export interface JXGElementHandle {
  Value: () => number;
  setValue: (value: number) => void;
  on: (event: string, handler: () => void) => void;
  setAttribute: (attrs: Record<string, unknown>) => void;
}

export interface JXGBoardHandle {
  create: (
    type: string,
    parents: unknown[],
    options?: Record<string, unknown>
  ) => JXGElementHandle;
  update: () => void;
  setBoundingBox: (
    bbox: [number, number, number, number],
    keepAspectRatio?: boolean
  ) => void;
  zoomIn: (x?: number, y?: number) => void;
  zoomOut: (x?: number, y?: number) => void;
  zoom100: () => void;
  getBoundingBox: () => [number, number, number, number];
}

interface JSXGraphRuntime {
  JSXGraph: {
    initBoard: (
      containerId: string,
      options: Record<string, unknown>
    ) => JXGBoardHandle;
    freeBoard: (board: JXGBoardHandle) => void;
  };
}

let runtimePromise: Promise<JSXGraphRuntime> | null = null;

function ensureJSXGraphCss() {
  if (typeof document === "undefined") {
    return;
  }

  const cssId = "jsxgraph-css";
  if (document.getElementById(cssId)) {
    return;
  }

  const link = document.createElement("link");
  link.id = cssId;
  link.rel = "stylesheet";
  link.href = "https://cdn.jsdelivr.net/npm/jsxgraph@1.12.2/distrib/jsxgraph.css";
  document.head.appendChild(link);
}

export async function loadJSXGraphRuntime(): Promise<JSXGraphRuntime> {
  ensureJSXGraphCss();

  if (!runtimePromise) {
    runtimePromise = import("jsxgraph")
      .then((mod) => mod.default as unknown as JSXGraphRuntime)
      .catch((error) => {
        runtimePromise = null;
        throw error;
      });
  }

  return runtimePromise;
}
