import * as d3 from "d3";

interface Props {
  values: number[];
  width?: number;
  height?: number;
  accent?: boolean; // draw in the accent tone instead of neutral
}

// A tiny hairline sparkline: no axes, no markers. Hallmark of data-editorial
// design in a small cell.
export default function Sparkline({ values, width = 68, height = 20, accent = false }: Props) {
  if (values.length < 2) return null;
  const x = d3.scaleLinear().domain([0, values.length - 1]).range([1, width - 1]);
  const ye = d3.extent(values) as [number, number];
  const pad = (ye[1] - ye[0] || 1) * 0.12;
  const y = d3.scaleLinear().domain([ye[0] - pad, ye[1] + pad]).range([height - 2, 2]);
  const line = d3.line<number>().x((_, i) => x(i)).y((v) => y(v)).curve(d3.curveMonotoneX);
  const d = line(values) ?? "";
  const lastX = x(values.length - 1);
  const lastY = y(values[values.length - 1]);
  return (
    <svg width={width} height={height} className="spark" aria-hidden focusable="false">
      <path d={d} fill="none"
            stroke={accent ? "var(--accent)" : "var(--data-strong)"}
            strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={1.6} fill={accent ? "var(--accent)" : "var(--data-strong)"} />
    </svg>
  );
}
