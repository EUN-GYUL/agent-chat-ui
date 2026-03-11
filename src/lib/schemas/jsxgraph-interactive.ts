import { z } from "zod";

export const JSXGraphSliderSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  default: z.number(),
});

export const JSXGraphPiecewisePartSchema = z.object({
  condition: z.string().min(1),
  expr: z.string().min(1),
});

export const JSXGraphElementSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
  expr: z.string().nullish(),
  piecewise: z.array(JSXGraphPiecewisePartSchema).nullish(),
  otherwise: z.string().nullish(),
  color: z.string().min(1),
  label: z.string().min(1),
  visible: z.boolean().nullish(),
  size: z.number().positive().nullish(),
  dash: z.number().nonnegative().nullish(),
  opacity: z.number().min(0).max(1).nullish(),
  fixed: z.boolean().nullish(),
}).superRefine((value, ctx) => {
  if (!value.expr && (!value.piecewise || value.piecewise.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "expr 또는 piecewise 중 하나는 필요합니다.",
      path: ["expr"],
    });
  }

  if (value.piecewise && value.piecewise.length > 0 && !value.otherwise) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "piecewise를 사용할 때는 otherwise가 필요합니다.",
      path: ["otherwise"],
    });
  }
});

export const JSXGraphWatchExpressionSchema = z.object({
  label: z.string().min(1),
  expr: z.string().min(1),
});

export const JSXGraphPresetSchema = z.object({
  label: z.string().min(1),
  values: z.record(z.string(), z.number()),
  isAnswer: z.boolean().optional(),
});

export const JSXGraphRelationModeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  dependent: z.string().min(1),
  independent: z.string().min(1),
  formula: z.string().min(1),
  modulo: z.number().positive().optional(),
});

export const JSXGraphCanvasSchema = z.object({
  viewBox: z.object({
    x: z.tuple([z.number(), z.number()]),
    y: z.tuple([z.number(), z.number()]),
  }),
  showGrid: z.boolean().optional(),
  showAxes: z.boolean().optional(),
});

export const JSXGraphInteractiveConfigSchema = z.object({
  title: z.string().min(1),
  canvas: JSXGraphCanvasSchema,
  sliders: z.array(JSXGraphSliderSchema),
  elements: z.array(JSXGraphElementSchema),
  watch_expressions: z.array(JSXGraphWatchExpressionSchema).optional(),
  presets: z.array(JSXGraphPresetSchema).optional(),
  relation_modes: z.array(JSXGraphRelationModeSchema).optional(),
  compact: z.boolean().optional(),
  analysis_description: z.string().optional(),
}).superRefine((value, ctx) => {
  const sliderIds = new Set<string>();
  for (const slider of value.sliders) {
    if (sliderIds.has(slider.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `중복된 slider id: ${slider.id}`,
        path: ["sliders"],
      });
    }
    sliderIds.add(slider.id);

    if (slider.min > slider.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${slider.id}의 min은 max보다 클 수 없습니다.`,
        path: ["sliders"],
      });
    }

    if (slider.default < slider.min || slider.default > slider.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${slider.id}의 default는 min/max 범위 안에 있어야 합니다.`,
        path: ["sliders"],
      });
    }
  }

  const elementIds = new Set<string>();
  for (const element of value.elements) {
    if (elementIds.has(element.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `중복된 element id: ${element.id}`,
        path: ["elements"],
      });
    }
    elementIds.add(element.id);
  }
});

export type JSXGraphSlider = z.infer<typeof JSXGraphSliderSchema>;
export type JSXGraphPiecewisePart = z.infer<typeof JSXGraphPiecewisePartSchema>;
export type JSXGraphElement = z.infer<typeof JSXGraphElementSchema>;
export type JSXGraphWatchExpression = z.infer<typeof JSXGraphWatchExpressionSchema>;
export type JSXGraphPreset = z.infer<typeof JSXGraphPresetSchema>;
export type JSXGraphRelationMode = z.infer<typeof JSXGraphRelationModeSchema>;
export type JSXGraphCanvas = z.infer<typeof JSXGraphCanvasSchema>;
export type JSXGraphInteractiveConfig = z.infer<typeof JSXGraphInteractiveConfigSchema>;
