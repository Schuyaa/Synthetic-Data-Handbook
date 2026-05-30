/**
 * Кастомная schema для rehype-sanitize — расширяет defaultSchema
 * поддержкой inline-SVG в Markdown-контенте глав, уроков и лаб.
 *
 * Источник untrusted-данных — поле content из БД, написанное
 * преподавателем/администратором. rehype-raw парсит сырой HTML
 * из этого поля, rehype-sanitize по этой схеме его чистит.
 *
 * Что РАЗРЕШЕНО дополнительно к defaultSchema:
 *   - презентационные SVG-теги (svg, path, circle, rect, g, text, …);
 *   - геометрические и презентационные SVG-атрибуты (d, viewBox, fill, …);
 *   - className / style / id на всех элементах (нужно для стилизации SVG
 *     и для className "math-inline"/"math-display", по которым rehype-katex
 *     находит формулы).
 *
 * Что ВЫРЕЗАЕТСЯ (не входит в whitelist → sanitize удаляет):
 *   - <script>, <foreignObject> — встраивание произвольного JS/HTML;
 *   - <animate>, <animateTransform>, <set> и прочие SMIL — могут нести
 *     event-триггеры (begin="click" и т.п.);
 *   - <use>, <image> — href может ссылаться на внешние/data-ресурсы;
 *   - <iframe>, <object>, <embed>;
 *   - все on*-атрибуты (onclick, onload, onmouseover, …) — их просто
 *     нет в whitelist, поэтому sanitize их срезает.
 *
 * href/src контролируются дефолтным protocols из defaultSchema
 * (разрешены http/https/mailto и подобные, заблокированы javascript:
 * и data:).
 */

import { defaultSchema } from "rehype-sanitize";

const SVG_TAGS = [
  "svg", "g", "path", "circle", "ellipse", "line", "polyline",
  "polygon", "rect", "text", "tspan", "defs",
  "linearGradient", "radialGradient", "stop", "marker", "title", "desc",
  "filter", "feDropShadow", "feGaussianBlur", "feOffset", "feBlend",
  "feMerge", "feMergeNode", "feFlood", "feColorMatrix", "feComposite",
  "feComponentTransfer", "feFuncA", "feFuncR", "feFuncG", "feFuncB",
  "feMorphology", "feTile",
  "clipPath", "mask", "pattern",
];

const SVG_ATTRS = [
  "className", "style", "id",
  "xmlns", "viewBox", "preserveAspectRatio",
  "width", "height", "x", "y", "x1", "y1", "x2", "y2",
  "cx", "cy", "r", "rx", "ry", "d", "points", "transform",
  "fill", "fillOpacity", "fillRule", "stroke", "strokeWidth",
  "strokeLinecap", "strokeLinejoin", "strokeDasharray",
  "strokeDashoffset", "strokeOpacity", "opacity", "color",
  "clipRule", "vectorEffect", "paintOrder",
  "gradientUnits", "gradientTransform", "offset",
  "stopColor", "stopOpacity",
  "textAnchor", "dominantBaseline", "fontFamily", "fontSize",
  "fontWeight", "fontStyle", "letterSpacing", "dx", "dy", "rotate",
  "markerStart", "markerMid", "markerEnd",
  "markerWidth", "markerHeight", "refX", "refY", "orient", "markerUnits",
  "role", "ariaLabel", "ariaHidden",
  "filter", "floodColor", "floodOpacity", "stdDeviation",
  "in", "in2", "result", "mode", "operator",
  "k1", "k2", "k3", "k4", "type", "values", "edgeMode",
  "baseFrequency", "numOctaves", "scale", "radius",
  "clipPath", "clipPathUnits", "maskUnits", "maskContentUnits",
  "patternUnits", "patternContentUnits", "patternTransform",
  "spreadMethod", "tableValues", "slope", "intercept", "amplitude",
  "exponent",
];

export const markdownSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    ...SVG_TAGS,
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] || []),
      ...SVG_ATTRS,
    ],
  },
};
