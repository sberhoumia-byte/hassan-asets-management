import { useEffect, useRef, useState, type ReactNode } from "react";

/** يصغّر ورقة A4 (210mm ≈ 794px) لتناسب عرض الحاوية في الشاشة دون التأثير على الطباعة. */
export function ScaledPreview({ children, maxScale = 1 }: { children: ReactNode; maxScale?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [h, setH] = useState<number | undefined>();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const s = Math.min(maxScale, (el.clientWidth - 16) / 794);
      setScale(s);
      setH(inner.current ? inner.current.scrollHeight * s : undefined);
    });
    ro.observe(el);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [maxScale]);

  return (
    <div ref={ref} className="a4-scale-wrap w-full overflow-hidden" style={{ height: h }}>
      <div ref={inner} className="a4-scale" style={{ transform: `scale(${scale})`, width: "100%" }}>
        {children}
      </div>
    </div>
  );
}
