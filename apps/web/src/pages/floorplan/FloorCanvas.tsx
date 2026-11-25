import { useEffect, useRef, useState } from "react";
import { Circle, Group, Image as KImage, Layer, Line, Rect, Stage, Text as KText, Transformer } from "react-konva";
import type Konva from "konva";
import type { FloorPlanShape, ShapeKind, ShapeLevel } from "../../api";

export type Tool = "select" | ShapeKind;
export type EditableShape = FloorPlanShape & { key: string };

/** ألوان الحالة (مع نص في وسيلة الإيضاح واللوحة الجانبية حتى لا يعتمد المعنى على اللون وحده). */
export const LEVEL_COLOR: Record<ShapeLevel, string> = { GOOD: "#2f9e44", WARN: "#e8590c", BAD: "#c92a2a", NONE: "#868e96" };

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const r4 = (v: number) => Math.round(v * 10000) / 10000;

interface Props {
  width: number;
  ratio: number; // الارتفاع / العرض
  background?: HTMLImageElement | null;
  shapes: EditableShape[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  editing: boolean;
  tool: Tool;
  onChange?: (key: string, patch: Partial<FloorPlanShape>) => void;
  onAdd?: (s: Omit<EditableShape, "key">) => void;
  labelOf: (s: EditableShape) => string;
  /** إنهاء المضلع من زر في شريط الأدوات (بديل النقر المزدوج على اللمس). */
  finishRef?: React.MutableRefObject<(() => void) | null>;
  onPolyChange?: (n: number) => void;
}

/** لوحة Konva: الإحداثيات المخزنة نسبية (0..1) وتُحوّل إلى بكسلات حسب عرض الحاوية. */
export function FloorCanvas({ width, ratio, background, shapes, selected, onSelect, editing, tool, onChange, onAdd, labelOf, finishRef, onPolyChange }: Props) {
  const W = Math.max(200, width);
  const H = Math.round(W * ratio);
  const trRef = useRef<Konva.Transformer>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [poly, setPoly] = useState<number[]>([]);

  useEffect(() => {
    setPoly([]);
    setDraft(null);
  }, [tool, editing]);

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const s = shapes.find((x) => x.key === selected);
    const node = editing && s && (s.kind === "RECTANGLE" || s.kind === "CIRCLE") ? layerRef.current?.findOne(`#shape-${s.key}`) : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selected, shapes, editing]);

  const pos = (e: Konva.KonvaEventObject<PointerEvent | MouseEvent>) => {
    const p = e.target.getStage()!.getPointerPosition()!;
    return { x: clamp(p.x / W), y: clamp(p.y / H) };
  };

  const down = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (!editing || tool === "select") {
      if (e.target === e.target.getStage() || e.target.name() === "bg") onSelect(null);
      return;
    }
    const p = pos(e);
    if (tool === "MARKER") return onAdd?.({ kind: "MARKER", geometry: { x: r4(p.x), y: r4(p.y) } });
    if (tool === "POLYGON") return setPoly((pts) => [...pts, r4(p.x), r4(p.y)]);
    setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const move = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (!draft) return;
    const p = pos(e);
    setDraft({ ...draft, x1: p.x, y1: p.y });
  };
  const up = () => {
    if (!draft) return;
    const { x0, y0, x1, y1 } = draft;
    setDraft(null);
    if (tool === "RECTANGLE") {
      const w = Math.abs(x1 - x0);
      const h = Math.abs(y1 - y0);
      if (w < 0.01 || h < 0.01) return;
      onAdd?.({ kind: "RECTANGLE", geometry: { x: r4(Math.min(x0, x1)), y: r4(Math.min(y0, y1)), w: r4(w), h: r4(h) } });
    } else if (tool === "CIRCLE") {
      const r = Math.hypot(x1 - x0, ((y1 - y0) * H) / W);
      if (r < 0.01) return;
      onAdd?.({ kind: "CIRCLE", geometry: { x: r4(x0), y: r4(y0), r: r4(clamp(r, 0.005, 1)) } });
    }
  };
  const finishPoly = () => {
    if (poly.length >= 6) onAdd?.({ kind: "POLYGON", geometry: { points: poly } });
    setPoly([]);
  };
  if (finishRef) finishRef.current = finishPoly;
  useEffect(() => onPolyChange?.(poly.length / 2), [poly, onPolyChange]);

  const dragEnd = (s: EditableShape) => (e: Konva.KonvaEventObject<DragEvent>) => {
    const n = e.target;
    const g = s.geometry as Record<string, number> & { points?: number[] };
    if (s.kind === "POLYGON") {
      const dx = n.x() / W;
      const dy = n.y() / H;
      n.position({ x: 0, y: 0 });
      onChange?.(s.key, { geometry: { points: g.points!.map((v, i) => r4(clamp(v + (i % 2 ? dy : dx)))) } });
    } else onChange?.(s.key, { geometry: { ...g, x: r4(clamp(n.x() / W)), y: r4(clamp(n.y() / H)) } });
  };
  const transformEnd = (s: EditableShape) => (e: Konva.KonvaEventObject<Event>) => {
    const n = e.target;
    const sx = n.scaleX();
    const sy = n.scaleY();
    n.scale({ x: 1, y: 1 });
    if (s.kind === "RECTANGLE")
      onChange?.(s.key, { geometry: { x: r4(clamp(n.x() / W)), y: r4(clamp(n.y() / H)), w: r4(clamp((n.width() * sx) / W, 0.005)), h: r4(clamp((n.height() * sy) / H, 0.005)) } });
    else onChange?.(s.key, { geometry: { x: r4(clamp(n.x() / W)), y: r4(clamp(n.y() / H)), r: r4(clamp(((n as Konva.Circle).radius() * sx) / W, 0.005)) } });
  };

  const canDrag = editing && tool === "select";
  return (
    <Stage
      width={W}
      height={H}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onDblClick={() => tool === "POLYGON" && finishPoly()}
      style={{ cursor: editing && tool !== "select" ? "crosshair" : "default", touchAction: editing ? "none" : "auto" }}
      data-testid="fp-stage"
    >
      <Layer listening>
        {background ? (
          <KImage name="bg" image={background} width={W} height={H} />
        ) : (
          <Group name="bg">
            <Rect name="bg" width={W} height={H} fill="#f8f9fa" />
            {Array.from({ length: 19 }, (_, i) => (
              <Line key={`v${i}`} points={[((i + 1) * W) / 20, 0, ((i + 1) * W) / 20, H]} stroke="#e9ecef" strokeWidth={1} listening={false} />
            ))}
            {Array.from({ length: Math.ceil(20 * ratio) - 1 }, (_, i) => (
              <Line key={`h${i}`} points={[0, ((i + 1) * W) / 20, W, ((i + 1) * W) / 20]} stroke="#e9ecef" strokeWidth={1} listening={false} />
            ))}
          </Group>
        )}
      </Layer>
      <Layer ref={layerRef}>
        {shapes.map((s) => {
          const color = LEVEL_COLOR[s.status?.level ?? "NONE"];
          const sel = s.key === selected;
          const common = {
            id: `shape-${s.key}`,
            stroke: sel ? "#1c7ed6" : color,
            strokeWidth: sel ? 3 : 2,
            fill: `${color}40`,
            draggable: canDrag,
            onClick: () => onSelect(s.key),
            onTap: () => onSelect(s.key),
            onDragEnd: dragEnd(s),
            onTransformEnd: transformEnd(s),
          };
          const g = s.geometry as Record<string, number> & { points?: number[] };
          const label = labelOf(s);
          let node: React.ReactNode;
          let lx = 0;
          let ly = 0;
          if (s.kind === "RECTANGLE") {
            node = <Rect {...common} x={g.x! * W} y={g.y! * H} width={g.w! * W} height={g.h! * H} cornerRadius={3} />;
            lx = (g.x! + g.w! / 2) * W;
            ly = (g.y! + g.h! / 2) * H;
          } else if (s.kind === "CIRCLE") {
            node = <Circle {...common} x={g.x! * W} y={g.y! * H} radius={g.r! * W} />;
            lx = g.x! * W;
            ly = g.y! * H;
          } else if (s.kind === "POLYGON") {
            const pts = g.points!.map((v, i) => v * (i % 2 ? H : W));
            node = <Line {...common} points={pts} closed />;
            const n = pts.length / 2;
            lx = pts.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) / n;
            ly = pts.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0) / n;
          } else {
            node = <Circle {...common} x={g.x! * W} y={g.y! * H} radius={9} fill={color} stroke={sel ? "#1c7ed6" : "#fff"} />;
            lx = g.x! * W;
            ly = g.y! * H + 18;
          }
          return (
            <Group key={s.key}>
              {node}
              {label && <KText x={lx - 70} y={ly - 7} width={140} align="center" text={label} fontSize={13} fontStyle="bold" fill="#212529" listening={false} />}
            </Group>
          );
        })}
        {draft && tool === "RECTANGLE" && (
          <Rect x={Math.min(draft.x0, draft.x1) * W} y={Math.min(draft.y0, draft.y1) * H} width={Math.abs(draft.x1 - draft.x0) * W} height={Math.abs(draft.y1 - draft.y0) * H} stroke="#1c7ed6" dash={[6, 4]} />
        )}
        {draft && tool === "CIRCLE" && <Circle x={draft.x0 * W} y={draft.y0 * H} radius={Math.hypot((draft.x1 - draft.x0) * W, (draft.y1 - draft.y0) * H)} stroke="#1c7ed6" dash={[6, 4]} />}
        {poly.length > 0 && (
          <>
            <Line points={poly.map((v, i) => v * (i % 2 ? H : W))} stroke="#1c7ed6" strokeWidth={2} dash={[6, 4]} />
            {Array.from({ length: poly.length / 2 }, (_, i) => (
              <Circle key={i} x={poly[i * 2]! * W} y={poly[i * 2 + 1]! * H} radius={4} fill="#1c7ed6" onClick={() => i === 0 && finishPoly()} />
            ))}
          </>
        )}
        <Transformer ref={trRef} rotateEnabled={false} keepRatio={false} ignoreStroke />
      </Layer>
    </Stage>
  );
}
