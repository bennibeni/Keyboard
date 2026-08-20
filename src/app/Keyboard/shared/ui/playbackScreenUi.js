"use client";

// Formats a 0..1 value (e.g. metroLevel) as a rounded whole-number percent
// string, e.g. 0.5 -> "50%". Extracted here because MetronomePanel.js
// previously repeated `Math.round(x * 100)}%` inline at two separate call
// sites (the badge and the slider readout) - a single formatter keeps
// both in sync if the rounding/format ever needs to change.
export function formatPercent01(x) {
  const n = Number(x);
  return `${Math.round((Number.isFinite(n) ? n : 0) * 100)}%`;
}

const PANEL_TONES = {
  zinc: {
    frame: "border-zinc-200 bg-white/90",
    head: "border-b border-zinc-200 bg-zinc-100/90 text-zinc-900",
  },
  sky: {
    frame: "border-sky-200 bg-sky-50/90",
    head: "border-b border-sky-200 bg-sky-100/90 text-sky-950",
  },
  amber: {
    frame: "border-amber-200 bg-amber-50/90",
    head: "border-b border-amber-200 bg-amber-100/90 text-amber-950",
  },
  emerald: {
    frame: "border-emerald-200 bg-emerald-50/90",
    head: "border-b border-emerald-200 bg-emerald-100/90 text-emerald-950",
  },
  violet: {
    frame: "border-violet-200 bg-violet-50/90",
    head: "border-b border-violet-200 bg-violet-100/90 text-violet-950",
  },
  cyan: {
    frame: "border-cyan-200 bg-cyan-50/90",
    head: "border-b border-cyan-200 bg-cyan-100/90 text-cyan-950",
  },
  rose: {
    frame: "border-rose-200 bg-rose-50/90",
    head: "border-b border-rose-200 bg-rose-100/90 text-rose-950",
  },
};

export function Shell({ children }) {
  return (
    <main className="min-h-svh w-full bg-[url('/backgrounds/concert-stage.png')] bg-cover bg-top-left bg-fixed px-4 pb-10 pt-28 sm:px-8 sm:pt-32">
      {/* max-w-[1204px] matches keyboardRoll's own cap in panelSpecs.js -
          every panel below is `w-full`, so capping the CONTAINER here is
          what makes them all render at the same width as the keyboard
          panel, instead of duplicating "max-w-[1204px]" across every
          entry in panelSpecs.js (which would drift out of sync the
          moment one of them gets edited and not the others). */}
      <div className="mx-auto flex w-full max-w-301 flex-col items-start gap-6">
        {children}
      </div>
      <footer className="projects-footer">
        <a href="https://links-page-bennibeni.vercel.app/">← All projects</a>
      </footer>
    </main>
  );
}

export function PanelFrame({
  title,
  tone = "zinc",
  minWidthClass = "min-w-[18rem]",
  maxWidthClass = "max-w-full",
  minHeightClass = "min-h-[8rem]",
  className = "",
  bodyClassName = "",
  titleRight = null,
  collapsible = false,
  defaultOpen = true,
  children,
}) {
  const palette = PANEL_TONES[tone] ?? PANEL_TONES.zinc;
  const outerClassName = [
    "flex w-fit flex-col overflow-hidden rounded-3xl border shadow-sm",
    palette.frame,
    minWidthClass,
    maxWidthClass,
    minHeightClass,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const header = (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-3 ${palette.head}`}
    >
      <div className="text-xs font-black uppercase tracking-[0.2em]">
        {title}
      </div>
      {titleRight ? (
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-80">
          {titleRight}
        </div>
      ) : null}
    </div>
  );

  const body = (
    <div
      className={["flex flex-1 flex-col p-5", bodyClassName]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );

  if (collapsible) {
    return (
      <details className={outerClassName} open={defaultOpen}>
        <summary
          className={`flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 ${palette.head}`}
        >
          <div className="text-xs font-black uppercase tracking-[0.2em]">
            {title}
          </div>
          <div className="rounded-full border border-current/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">
            {titleRight ?? "show / hide"}
          </div>
        </summary>
        {body}
      </details>
    );
  }

  return (
    <section className={outerClassName}>
      {header}
      {body}
    </section>
  );
}

export function Card({ className = "", children }) {
  return (
    <div
      className={`w-fit max-w-full rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function Label({ children }) {
  return (
    <div className="mb-2 text-xs font-extrabold uppercase tracking-widest text-zinc-500">
      {children}
    </div>
  );
}

export function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm font-bold text-zinc-700 sm:w-32">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function Slider({
  min,
  max,
  step,
  value,
  onChange,
  disabled,
  className = "",
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`block w-full max-w-full accent-zinc-900 disabled:opacity-50 ${className}`}
    />
  );
}

export function Select({ value, onChange, options, disabled, className = "" }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`block w-full max-w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-bold text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 ${className}`}
    >
      {options.map((o) => (
        <option key={o.value ?? o} value={o.value ?? o}>
          {o.label ?? o}
        </option>
      ))}
    </select>
  );
}

export function Button({
  type = "button",
  variant = "secondary",
  size = "transport",
  disabled = false,
  className = "",
  children,
  ...props
}) {
  const base = "rounded-2xl font-extrabold shadow-sm transition";

  const tone = disabled
    ? "cursor-not-allowed bg-zinc-200 text-zinc-400"
    : variant === "primary"
      ? "bg-zinc-900 text-white hover:bg-zinc-800"
      : variant === "warning"
        ? "bg-amber-500 text-white hover:bg-amber-600"
        : variant === "ghost"
          ? "border border-black/10 bg-white text-black/70 hover:bg-black/[0.03]"
          : "bg-white text-zinc-900 ring-1 ring-zinc-300 hover:bg-zinc-50";

  const sizing =
    size === "compact"
      ? "px-3 py-2 text-sm font-medium"
      : "px-5 py-4 text-base";

  return (
    <button
      type={type}
      disabled={disabled}
      className={`${base} ${tone} ${sizing} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
