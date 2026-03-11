"use client";

import React from "react";
import {
  loadJSXGraphRuntime,
  type JXGBoardHandle,
  type JXGElementHandle,
} from "@/lib/jsxgraph/runtime";
import {
  JSXGraphInteractiveConfigSchema,
  type JSXGraphInteractiveConfig,
  type JSXGraphPreset,
  type JSXGraphPiecewisePart,
} from "@/lib/schemas/jsxgraph-interactive";

interface JSXGraphInteractiveProps extends JSXGraphInteractiveConfig {
  tool_call_id?: string;
  problem_id?: string;
  result_type?: string;
}

/**
 * 허용된 Math 함수 목록
 */
const ALLOWED_MATH_FUNCTIONS = [
  "abs",
  "acos",
  "asin",
  "atan",
  "atan2",
  "ceil",
  "cos",
  "exp",
  "floor",
  "log",
  "log10",
  "log2",
  "max",
  "min",
  "pow",
  "random",
  "round",
  "sign",
  "sin",
  "sqrt",
  "tan",
  "PI",
  "E",
  "LN2",
  "LN10",
  "LOG2E",
  "LOG10E",
  "SQRT2",
  "SQRT1_2",
];

/**
 * 수식 문자열이 안전한지 검증
 * 허용된 문자와 Math 함수만 포함되어 있는지 확인
 */
function validateExpression(expr: string): boolean {
  // Math.xxx 형태를 검증
  const mathPattern = /Math\.([a-zA-Z0-9_]+)/g;
  let match;
  while ((match = mathPattern.exec(expr)) !== null) {
    const funcName = match[1];
    if (!ALLOWED_MATH_FUNCTIONS.includes(funcName)) {
      return false;
    }
  }

  // 테스트용 수식 준비: 검증 완료된 패턴을 숫자로 치환
  let testExpr = expr;
  testExpr = testExpr.replace(/Math\.[a-zA-Z0-9_]+/g, "0");
  testExpr = testExpr.replace(
    /sliders\.[a-zA-Z_][a-zA-Z0-9_]*\.Value\(\)/g,
    "0"
  );
  testExpr = testExpr.replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g, "0");
  testExpr = testExpr.replace(/NaN/g, "0");

  // 최종 검증: 숫자, 연산자, 괄호, 공백, 소수점, 비교/삼항 연산자만 허용
  if (!/^[\d\s+\-*/%().?:<>=!&|,]+$/.test(testExpr)) {
    return false;
  }

  return true;
}

/**
 * 안전한 수식 평가 함수 (단순 수식용)
 * 변수를 값으로 치환 후 기본 연산만 허용
 */
function safeEvaluate(
  formula: string,
  variables: Record<string, number>
): number {
  let expr = formula;
  for (const [name, value] of Object.entries(variables)) {
    expr = expr.replace(new RegExp(`\\b${name}\\b`, "g"), value.toString());
  }

  // Math 함수를 포함한 표현식 검증 (Math.sin, Math.cos, Math.PI 등 지원)
  if (!validateExpression(expr)) {
    throw new Error(`Invalid expression: ${expr}`);
  }

  return new Function(`"use strict"; return (${expr})`)() as number;
}

function evaluateWatchExpression(
  expr: string,
  variables: Record<string, number>
): string {
  const trimmed = expr.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }

  const result = safeEvaluate(expr, variables);
  return Number.isNaN(result) ? "N/A" : result.toFixed(2);
}

/**
 * 안전한 함수 그래프 생성기
 * 수식을 검증한 후 함수를 생성
 */
function createSafeGraphFunction(
  expr: string
):
  | ((x: number, sliders: Record<string, { Value: () => number }>) => number)
  | null {
  if (!validateExpression(expr)) {
    console.warn(`Unsafe expression rejected: ${expr}`);
    return null;
  }

  try {
    return new Function("x", "sliders", `"use strict"; return ${expr}`) as (
      x: number,
      sliders: Record<string, { Value: () => number }>
    ) => number;
  } catch (e) {
    console.warn(`Failed to create function from expression: ${expr}`, e);
    return null;
  }
}

/**
 * piecewise 배열을 중첩 삼항 연산자 문자열로 변환
 *
 * @example
 * buildExprFromPiecewise(
 *   [{ condition: "x < 0", expr: "x*x" }, { condition: "x < 1", expr: "-x*x" }],
 *   "x"
 * )
 * // 결과: "(x < 0) ? (x*x) : (x < 1) ? (-x*x) : (x)"
 */
function buildExprFromPiecewise(
  piecewise: JSXGraphPiecewisePart[],
  otherwise: string
): string {
  if (!piecewise || piecewise.length === 0) {
    return otherwise;
  }

  // 역순으로 순회하며 중첩 삼항 연산자 구성
  let result = otherwise;
  for (let i = piecewise.length - 1; i >= 0; i--) {
    const piece = piecewise[i];
    result = `(${piece.condition}) ? (${piece.expr}) : (${result})`;
  }
  return result;
}

function splitTopLevel(expr: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of expr) {
    if (char === "[" || char === "(" || char === "{") {
      depth += 1;
    } else if (char === "]" || char === ")" || char === "}") {
      depth = Math.max(0, depth - 1);
    }

    if (char === separator && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function parseCoordinatePair(expr: string): [string, string] | null {
  const trimmed = expr.trim();

  if (trimmed.includes(";")) {
    const parts = trimmed.split(";").map((part) => part.trim());
    return parts.length >= 2 ? [parts[0], parts[1]] : null;
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    const parts = splitTopLevel(inner, ",");
    return parts.length === 2 ? [parts[0], parts[1]] : null;
  }

  return null;
}

function parsePolygonPoints(expr: string): Array<[string, string]> {
  const trimmed = expr.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return [];
  }

  const inner = trimmed.slice(1, -1).trim();
  return splitTopLevel(inner, ",")
    .map((part) => parseCoordinatePair(part))
    .filter((point): point is [string, string] => Array.isArray(point));
}

/** 슬라이더 레이블에서 id를 제외한 설명 부분만 추출 */
function formatSliderSuffix(id: string, label: string): string | null {
  if (label === id) return null;
  if (label.startsWith(id)) {
    const rest = label.slice(id.length).replace(/^\s*[(（]/, "(");
    return rest;
  }
  return `(${label})`;
}

/**
 * JSXGraph Interactive Component
 * GeoGebra를 대체하는 경량 인터랙티브 시각화 컴포넌트
 */
const JSXGraphInteractiveInner: React.FC<JSXGraphInteractiveProps> = (props) => {
  const parsedConfig = React.useMemo(
    () =>
      JSXGraphInteractiveConfigSchema.safeParse({
        title: props.title,
        canvas: props.canvas,
        sliders: props.sliders,
        elements: props.elements,
        watch_expressions: props.watch_expressions,
        presets: props.presets,
        relation_modes: props.relation_modes,
        compact: props.compact,
        analysis_description: props.analysis_description,
      }),
    [
      props.analysis_description,
      props.canvas,
      props.compact,
      props.elements,
      props.presets,
      props.relation_modes,
      props.sliders,
      props.title,
      props.watch_expressions,
    ]
  );
  const hasValidConfig = parsedConfig.success;
  if (!hasValidConfig) {
    console.error("[JSXGraph] Invalid props:", parsedConfig.error.flatten());
  }

  const fallbackConfig = React.useMemo(
    () => ({
      title: typeof props.title === "string" && props.title ? props.title : "그래프",
      canvas: {
        viewBox: { x: [-10, 10] as [number, number], y: [-10, 10] as [number, number] },
        showGrid: false,
        showAxes: true,
      },
      sliders: [],
      elements: [],
      watch_expressions: [],
      presets: [],
      relation_modes: [],
      compact: props.compact,
      analysis_description: props.analysis_description,
    }),
    [props.analysis_description, props.compact, props.title]
  );

  const {
    title,
    canvas,
    sliders,
    elements,
    watch_expressions,
    presets,
    relation_modes,
    compact,
    analysis_description,
  } = hasValidConfig ? parsedConfig.data : fallbackConfig;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const boardRef = React.useRef<JXGBoardHandle | null>(null);
  const elementsRef = React.useRef<Record<string, JXGElementHandle>>({});
  const sliderValuesRef = React.useRef<Record<string, number>>({});

  const [isLoaded, setIsLoaded] = React.useState(false);
  const [sliderValues, setSliderValues] = React.useState<
    Record<string, number>
  >({});
  const [watchValues, setWatchValues] = React.useState<Record<string, string>>(
    {}
  );

  // 관계 모드 상태
  const [activeRelationMode, setActiveRelationMode] = React.useState<
    string | null
  >(relation_modes && relation_modes.length > 0 ? relation_modes[0].id : null);

  // 초기 boundingbox 저장
  const initialBboxRef = React.useRef<
    [number, number, number, number] | null
  >(null);

  // 고유 container ID 생성
  const containerIdRef = React.useRef(
    `jxg-${Math.random().toString(36).substr(2, 9)}`
  );

  // 설정 키
  const configKey = React.useMemo(
    () => JSON.stringify({ elements, sliders }),
    [elements, sliders]
  );

  // 슬라이더 초기값 설정
  React.useEffect(() => {
    const initial: Record<string, number> = {};
    sliders?.forEach((s) => {
      initial[s.id] = s.default;
    });

    if (relation_modes && relation_modes.length > 0) {
      const defaultMode = relation_modes[0];
      const independentValue = initial[defaultMode.independent] ?? 0;
      try {
        let result = safeEvaluate(defaultMode.formula, {
          [defaultMode.independent]: independentValue,
        });
        const modulo = defaultMode.modulo ?? 360;
        result = ((result % modulo) + modulo) % modulo;
        initial[defaultMode.dependent] = result;
      } catch (e) {
        console.warn("Failed to evaluate initial relation formula:", e);
      }
    }

    sliderValuesRef.current = initial;
    setSliderValues(initial);
  }, [configKey, sliders, elements, relation_modes]);

  // Watch expression 업데이트
  const updateWatchValues = React.useCallback(() => {
    if (!hasValidConfig || !watch_expressions || watch_expressions.length === 0) return;

    const newValues: Record<string, string> = {};

    watch_expressions.forEach((watchExpr) => {
      try {
        const sliderVals: Record<string, number> = { ...sliderValuesRef.current };
        newValues[watchExpr.label] = evaluateWatchExpression(watchExpr.expr, sliderVals);
      } catch {
        newValues[watchExpr.label] = "N/A";
      }
    });

    setWatchValues(newValues);
  }, [hasValidConfig, watch_expressions]);

  // JSXGraph 스크립트 로드 및 보드 초기화
  React.useEffect(() => {
    if (!hasValidConfig) {
      setIsLoaded(false);
      return;
    }

    let disposed = false;
    const containerId = `jxg-${Math.random().toString(36).substr(2, 9)}`;
    containerIdRef.current = containerId;
    setIsLoaded(false);

    let runtimeRef: Awaited<ReturnType<typeof loadJSXGraphRuntime>> | null = null;

    const initBoard = async () => {
      const runtime = await loadJSXGraphRuntime();
      runtimeRef = runtime;
      if (disposed || !containerRef.current) return;

      if (boardRef.current) {
        try {
          runtime.JSXGraph.freeBoard(boardRef.current);
        } catch {
          // ignore
        }
        boardRef.current = null;
      }

      containerRef.current.innerHTML = "";
      containerRef.current.id = containerId;

      const { viewBox } = canvas;
      const boundingbox: [number, number, number, number] = [
        viewBox.x[0],
        viewBox.y[1],
        viewBox.x[1],
        viewBox.y[0],
      ];

      const board = runtime.JSXGraph.initBoard(containerId, {
        boundingbox,
        axis: false,
        grid: canvas.showGrid ?? false,
        showNavigation: false,
        showCopyright: false,
        keepAspectRatio: true,
        pan: { enabled: true, needShift: false, needTwoFingers: false },
        zoom: { enabled: true, wheel: true, needShift: false, pinch: true },
      });

      if (canvas.showAxes ?? true) {
        board.create("axis", [[0, 0], [1, 0]], {
          ticks: {
            ticksDistance: 1,
            minorTicks: 0,
            drawLabels: true,
          },
        });
        board.create("axis", [[0, 0], [0, 1]], {
          ticks: { ticksDistance: 1, minorTicks: 0, drawLabels: true },
        });
      }

      boardRef.current = board;
      elementsRef.current = {};
      initialBboxRef.current = boundingbox;

      const initialSliderValues: Record<string, number> = {};
      sliders?.forEach((s) => {
        initialSliderValues[s.id] = s.default;
      });

      if (relation_modes && relation_modes.length > 0) {
        const defaultMode = relation_modes[0];
        const independentValue = initialSliderValues[defaultMode.independent] ?? 0;
        try {
          let result = safeEvaluate(defaultMode.formula, {
            [defaultMode.independent]: independentValue,
          });
          const modulo = defaultMode.modulo ?? 360;
          result = ((result % modulo) + modulo) % modulo;
          initialSliderValues[defaultMode.dependent] = result;
        } catch {
          // ignore
        }
      }

      sliderValuesRef.current = initialSliderValues;

      // 공유 슬라이더 프록시 생성기
      const getSliderProxy = () => {
        const proxy: Record<string, { Value: () => number }> = {};
        for (const id of Object.keys(sliderValuesRef.current)) {
          proxy[id] = { Value: () => sliderValuesRef.current[id] };
        }
        return proxy;
      };

      // 안전한 point 표현식 함수 생성 ("xExpr ; yExpr" 또는 "[xExpr, yExpr]")
      const createPointFunctions = (expr: string) => {
        const pair = parseCoordinatePair(expr);
        if (!pair) return null;

        const xFn = createSafeGraphFunction(pair[0]);
        const yFn = createSafeGraphFunction(pair[1]);
        if (!xFn || !yFn) return null;
        return {
          x: () => { try { return xFn(0, getSliderProxy()); } catch { return 0; } },
          y: () => { try { return yFn(0, getSliderProxy()); } catch { return 0; } },
        };
      };

      elements?.forEach((el) => {
        try {
          if (el.type === "functiongraph") {
            const exprToUse =
              el.piecewise && el.piecewise.length > 0
                ? buildExprFromPiecewise(el.piecewise, el.otherwise || "NaN")
                : el.expr || "0";

            const fn = createSafeGraphFunction(exprToUse);
            if (!fn) {
              console.warn(`Skipping unsafe graph element: ${el.id}`);
              return;
            }

            const graph = board.create(
              "functiongraph",
              [(x: number) => { try { return fn(x, getSliderProxy()); } catch { return NaN; } }],
              {
                strokeColor: el.color || "#2563eb",
                strokeWidth: el.size || 2,
                dash: el.dash || 0,
                name: el.label,
                visible: el.visible !== false,
                strokeOpacity: el.opacity ?? 1,
              }
            );
            elementsRef.current[el.id] = graph;

          } else if (el.type === "line") {
            const lineFn = createSafeGraphFunction(el.expr || "0");
            if (!lineFn) return;

            const line = board.create(
              "functiongraph",
              [(x: number) => { try { return lineFn(x, getSliderProxy()); } catch { return NaN; } }],
              {
                strokeColor: el.color || "#9ca3af",
                strokeWidth: el.size || 1.5,
                dash: el.dash || 0,
                name: el.label,
                visible: el.visible !== false,
                strokeOpacity: el.opacity ?? 1,
              }
            );
            elementsRef.current[el.id] = line;

          } else if (el.type === "arrow") {
            const angleVar = el.expr || "0";
            const getAngle = () => {
              const val = sliderValuesRef.current[angleVar];
              return val !== undefined ? val : parseFloat(angleVar) || 0;
            };

            const origin = board.create("point", [0, 0], { visible: false, fixed: true });
            const endpoint = board.create("point", [
              () => Math.cos((getAngle() * Math.PI) / 180),
              () => Math.sin((getAngle() * Math.PI) / 180),
            ], { visible: true, fixed: true, size: 3, color: el.color || "#2563eb", name: el.label || "" });
            const arrow = board.create("arrow", [origin, endpoint], {
              strokeColor: el.color || "#2563eb", strokeWidth: 2, visible: el.visible !== false,
            });
            elementsRef.current[el.id] = arrow;

          } else if (el.type === "circle") {
            // circle: expr = "radius" (원점 중심)
            const radiusExpr = el.expr || "1";
            const radiusFn = createSafeGraphFunction(radiusExpr);
            if (!radiusFn) return;

            const center = board.create("point", [0, 0], { visible: false, fixed: true });
            const circle = board.create("circle", [center, () => {
              try { return radiusFn(0, getSliderProxy()); } catch { return 1; }
            }], {
              strokeColor: el.color || "#9ca3af",
              strokeWidth: el.size || 1,
              dash: el.dash || 0,
              fillColor: "none",
              fixed: true,
              name: el.label || "",
              visible: el.visible !== false,
              highlightStrokeColor: el.color || "#9ca3af",
              strokeOpacity: el.opacity ?? 1,
            });
            elementsRef.current[el.id] = circle;

          } else if (el.type === "point") {
            // point: expr = "xExpr ; yExpr" 또는 "[xExpr, yExpr]"
            const fns = createPointFunctions(el.expr || "0;0");
            if (!fns) return;

            const point = board.create("point", [fns.x, fns.y], {
              size: el.size || 3,
              color: el.color || "#2563eb",
              fillColor: el.color || "#2563eb",
              strokeColor: el.color || "#2563eb",
              name: el.label || "",
              fixed: el.fixed !== false,
              visible: el.visible !== false,
              withLabel: !!(el.label),
              label: el.label ? { offset: [8, 8], fontSize: 13, cssClass: "font-semibold" } : undefined,
            });
            elementsRef.current[el.id] = point;

          } else if (el.type === "polygon") {
            const points = parsePolygonPoints(el.expr || "")
              .map(([xExpr, yExpr]) => {
                const xFn = createSafeGraphFunction(xExpr);
                const yFn = createSafeGraphFunction(yExpr);
                if (!xFn || !yFn) return null;

                return board.create("point", [
                  () => { try { return xFn(0, getSliderProxy()); } catch { return 0; } },
                  () => { try { return yFn(0, getSliderProxy()); } catch { return 0; } },
                ], { visible: false, fixed: true });
              })
              .filter((point): point is JXGElementHandle => point !== null);

            if (points.length < 3) return;

            const polygon = board.create("polygon", points, {
              borders: {
                strokeColor: el.color || "#2563eb",
                strokeWidth: el.size || 1.5,
                dash: el.dash || 0,
                strokeOpacity: el.opacity ?? 1,
              },
              fillColor: el.color || "#2563eb",
              fillOpacity: (el.opacity ?? 0.2) * 0.6,
              visible: el.visible !== false,
              fixed: true,
              withLines: true,
              vertices: { visible: false, fixed: true },
              name: el.label || "",
            });
            elementsRef.current[el.id] = polygon;

          } else if (el.type === "segment") {
            // segment: "pointId1 ; pointId2" (기존 점 참조)
            //      또는 "x1Expr ; y1Expr ; x2Expr ; y2Expr" (4개 표현식)
            const parts = (el.expr || "").split(";").map((s) => s.trim());

            let seg;
            if (parts.length === 2) {
              // 점 ID 참조 모드
              const p1 = elementsRef.current[parts[0]];
              const p2 = elementsRef.current[parts[1]];
              if (!p1 || !p2) {
                console.warn(`Segment ${el.id}: point refs not found (${parts[0]}, ${parts[1]})`);
                return;
              }
              seg = board.create("segment", [p1, p2], {
                strokeColor: el.color || "#2563eb",
                strokeWidth: el.size || 1.5,
                dash: el.dash || 0,
                visible: el.visible !== false,
                fixed: true,
                strokeOpacity: el.opacity ?? 1,
              });
            } else if (parts.length === 4) {
              // 4개 좌표 표현식 모드
              const x1Fn = createSafeGraphFunction(parts[0]);
              const y1Fn = createSafeGraphFunction(parts[1]);
              const x2Fn = createSafeGraphFunction(parts[2]);
              const y2Fn = createSafeGraphFunction(parts[3]);
              if (!x1Fn || !y1Fn || !x2Fn || !y2Fn) return;

              const sp = getSliderProxy;
              const p1 = board.create("point", [
                () => { try { return x1Fn(0, sp()); } catch { return 0; } },
                () => { try { return y1Fn(0, sp()); } catch { return 0; } },
              ], { visible: false, fixed: true });
              const p2 = board.create("point", [
                () => { try { return x2Fn(0, sp()); } catch { return 0; } },
                () => { try { return y2Fn(0, sp()); } catch { return 0; } },
              ], { visible: false, fixed: true });

              seg = board.create("segment", [p1, p2], {
                strokeColor: el.color || "#2563eb",
                strokeWidth: el.size || 1.5,
                dash: el.dash || 0,
                visible: el.visible !== false,
                fixed: true,
                strokeOpacity: el.opacity ?? 1,
              });
            }
            if (seg) elementsRef.current[el.id] = seg;
          }
        } catch (error) {
          console.warn(`Failed to create element ${el.id}:`, error);
        }
      });

      updateWatchValues();
      setIsLoaded(true);
    };

    void initBoard();

    return () => {
      disposed = true;
      if (boardRef.current) {
        if (runtimeRef) {
          try {
            runtimeRef.JSXGraph.freeBoard(boardRef.current);
          } catch {
            // ignore
          }
        }
        boardRef.current = null;
      }
    };
  }, [configKey, canvas, sliders, elements, relation_modes, updateWatchValues, hasValidConfig]);

  const handleSliderChange = (id: string, value: number, skipRelation = false) => {
    const newValues: Record<string, number> = { [id]: value };

    if (!skipRelation && activeRelationMode && relation_modes) {
      const mode = relation_modes.find((m) => m.id === activeRelationMode);
      if (mode && id === mode.independent) {
        try {
          let result = safeEvaluate(mode.formula, { [mode.independent]: value });
          const modulo = mode.modulo ?? 360;
          result = ((result % modulo) + modulo) % modulo;
          newValues[mode.dependent] = result;
        } catch (e) {
          console.warn("Failed to evaluate relation formula:", e);
        }
      }
    }

    sliderValuesRef.current = { ...sliderValuesRef.current, ...newValues };
    setSliderValues((prev) => ({ ...prev, ...newValues }));
    boardRef.current?.update();
    updateWatchValues();
  };

  const handlePresetClick = (preset: JSXGraphPreset) => {
    Object.entries(preset.values).forEach(([id, value]) => {
      handleSliderChange(id, value, true);
    });
  };

  const handleRelationModeChange = (modeId: string | null) => {
    setActiveRelationMode(modeId);
    if (modeId && relation_modes) {
      const mode = relation_modes.find((m) => m.id === modeId);
      if (mode) {
        const independentValue = sliderValues[mode.independent] ?? 0;
        handleSliderChange(mode.independent, independentValue);
      }
    }
  };

  const handleZoomIn = () => { boardRef.current?.zoomIn(); };
  const handleZoomOut = () => { boardRef.current?.zoomOut(); };
  const handleZoomReset = () => {
    if (boardRef.current && initialBboxRef.current) {
      boardRef.current.setBoundingBox(initialBboxRef.current, true);
    }
  };

  if (!hasValidConfig) {
    return (
      <div
        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        data-testid="jsxgraph-invalid-state"
      >
        인터랙티브 그래프 설정에 문제가 있어 표시하지 못했습니다.
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden text-xs"
      data-testid="jsxgraph-interactive"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
        <span className="text-sm font-medium text-gray-700 truncate">
          {title || "그래프"}
        </span>
      </div>

      {/* Canvas */}
      <div className="relative overflow-hidden">
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
            <span className="text-sm text-gray-400 animate-pulse">불러오는 중...</span>
          </div>
        )}
        <div
          ref={containerRef}
          data-testid="jsxgraph-board"
          className={`w-full cursor-grab active:cursor-grabbing max-h-[45vh] ${
            compact ? "min-h-[120px] sm:min-h-[150px]" : "min-h-[160px] sm:min-h-[220px]"
          }`}
          style={{ aspectRatio: compact ? "5/2" : "16/10" }}
          suppressHydrationWarning
        />
        {isLoaded && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 z-20">
            <div className="flex rounded-lg border border-gray-200 bg-white/90 backdrop-blur-sm shadow-sm text-sm">
              <button onClick={handleZoomIn} className="px-2.5 py-1.5 hover:bg-gray-100 transition-colors" title="확대">+</button>
              <button onClick={handleZoomOut} className="px-2.5 py-1.5 border-x border-gray-200 hover:bg-gray-100 transition-colors" title="축소">&minus;</button>
              <button onClick={handleZoomReset} className="px-2.5 py-1.5 hover:bg-gray-100 transition-colors" title="리셋">&#8634;</button>
            </div>
          </div>
        )}
      </div>

      {/* Sliders */}
      {sliders && sliders.length > 0 && (
        <div className="px-3 py-2.5 border-t border-gray-100">
          <div className="space-y-3">
            {sliders.map((slider) => {
              const isDependent = activeRelationMode && relation_modes?.find(
                (m) => m.id === activeRelationMode && m.dependent === slider.id
              );
              return (
                <div key={slider.id} className={`${isDependent ? "opacity-50" : ""}`}>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700 leading-snug">
                      <span className="text-sm font-semibold text-gray-900">{slider.id}</span>
                      {(() => {
                        const suffix = formatSliderSuffix(slider.id, slider.label);
                        return suffix ? <span className="text-gray-500 ml-1">{suffix}</span> : null;
                      })()}
                    </span>
                    <span className="text-sm font-mono font-semibold text-blue-600 tabular-nums ml-2">
                      {(sliderValues[slider.id] ?? slider.default).toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 tabular-nums w-6 text-right flex-shrink-0">{slider.min}</span>
                    <input
                      type="range"
                      min={slider.min}
                      max={slider.max}
                      step={slider.step}
                      value={sliderValues[slider.id] ?? slider.default}
                      onChange={(e) => handleSliderChange(slider.id, parseFloat(e.target.value))}
                      disabled={!!isDependent}
                      data-testid={`jsxgraph-slider-${slider.id}`}
                      className={`flex-1 h-2 accent-blue-500 cursor-pointer ${isDependent ? "cursor-not-allowed" : ""}`}
                    />
                    <span className="text-[10px] text-gray-400 tabular-nums w-6 flex-shrink-0">{slider.max}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Relation Modes */}
      {relation_modes && relation_modes.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-100">
          <div className="flex flex-wrap gap-1.5">
            {relation_modes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => handleRelationModeChange(mode.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeRelationMode === mode.id
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {mode.label}
              </button>
            ))}
            <button
              onClick={() => handleRelationModeChange(null)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeRelationMode === null
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              자유 모드
            </button>
          </div>
        </div>
      )}

      {/* Presets */}
      {presets && presets.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-100">
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset, idx) => (
              <button
                key={idx}
                onClick={() => handlePresetClick(preset)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex-1 min-w-[64px] transition-colors ${
                  preset.isAnswer
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Watch Expressions */}
      {watch_expressions && watch_expressions.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-100">
          <div className="px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 justify-center">
              {watch_expressions.map((expr, idx) => (
                <span
                  key={idx}
                  className="text-xs text-gray-700"
                  data-testid={`jsxgraph-watch-${idx}`}
                  data-label={expr.label}
                >
                  <span className="text-gray-500">{expr.label}:</span>{" "}
                  <span className="font-mono font-bold text-sm text-gray-900">{watchValues[expr.label] ?? "—"}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Analysis Description */}
      {analysis_description && (
        <div className="px-3 py-2 border-t border-gray-100">
          <div className="px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-100">
            <p className="text-[13px] text-gray-600 whitespace-pre-wrap leading-relaxed">
              {analysis_description}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export const JSXGraphInteractive = React.memo(JSXGraphInteractiveInner);
