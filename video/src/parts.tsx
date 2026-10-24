import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { C, CHANNEL_COLORS, FONT, STEP_FRAMES } from "./theme";

const out = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Slate floor with a faint vignette, like the studio's workspace. */
export const Background: React.FC = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(120% 90% at 50% 0%, #1b212c 0%, ${C.void} 62%)`,
    }}
  />
);

/** One row of the step sequencer, lighting step by step at the beat's tempo: the film's recurring motif. */
export const StepRow: React.FC<{ hits: number[]; color?: string; size?: number; delay?: number }> = ({
  hits,
  color = CHANNEL_COLORS[5],
  size = 46,
  delay = 0,
}) => {
  const frame = useCurrentFrame() - delay;
  const now = Math.floor(Math.max(0, frame) / STEP_FRAMES) % 16;
  return (
    <div style={{ display: "flex", gap: size * 0.2 }}>
      {Array.from({ length: 16 }, (_, i) => {
        const on = hits.includes(i);
        const appear = interpolate(frame, [i * 1.2, i * 1.2 + 14], [0, 1], { ...clamp, easing: out });
        const isNow = frame >= 0 && now === i;
        return (
          <div
            key={i}
            style={{
              width: size,
              height: size * 1.3,
              marginLeft: i % 4 === 0 && i ? size * 0.22 : 0,
              borderRadius: size * 0.16,
              background: on ? color : isNow ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
              boxShadow: on ? `0 0 ${isNow ? 40 : 22}px -4px ${color}, inset 0 1px 0 rgba(255,255,255,0.35)` : "inset 0 1px 0 rgba(255,255,255,0.05)",
              opacity: appear,
              translate: `0 ${(1 - appear) * 18}px`,
              scale: on && isNow ? 1.1 : 1,
              filter: on && isNow ? "brightness(1.5)" : "none",
            }}
          />
        );
      })}
    </div>
  );
};

/** A big condensed line that rises out of a mask. */
export const RiseLine: React.FC<{ children: React.ReactNode; delay?: number; size?: number; color?: string; weight?: number }> = ({
  children,
  delay = 0,
  size = 150,
  color = C.text,
  weight = 700,
}) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [delay, delay + 22], [0, 1], { ...clamp, easing: out });
  return (
    <div style={{ overflow: "hidden", paddingBottom: size * 0.08 }}>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: weight,
          fontStretch: "75%",
          fontSize: size,
          lineHeight: 0.95,
          letterSpacing: "-0.03em",
          color,
          translate: `0 ${(1 - t) * 105}%`,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export const Fade: React.FC<{ children: React.ReactNode; delay?: number; style?: React.CSSProperties }> = ({ children, delay = 0, style }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [delay, delay + 18], [0, 1], { ...clamp, easing: out });
  return <div style={{ opacity: t, translate: `0 ${(1 - t) * 16}px`, ...style }}>{children}</div>;
};

/** A text card between two shots: the film pauses to say one thing. */
export const Card: React.FC<{ lines: string[]; sub?: string; duration: number }> = ({ lines, sub, duration }) => {
  const frame = useCurrentFrame();
  const leave = interpolate(frame, [duration - 8, duration], [1, 0], { ...clamp, easing: Easing.in(Easing.cubic) });
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 160px", opacity: leave, scale: interpolate(leave, [0, 1], [0.98, 1]) }}>
      {lines.map((l, i) => (
        <RiseLine key={i} delay={i * 6}>
          {l}
        </RiseLine>
      ))}
      {sub && (
        <Fade delay={lines.length * 6 + 8} style={{ marginTop: 36, fontFamily: FONT, fontSize: 40, color: C.text2, maxWidth: 1100 }}>
          {sub}
        </Fade>
      )}
    </AbsoluteFill>
  );
};

/** A file landing on the studio: a glass chip that drops in and is "absorbed". */
export const FileChip: React.FC<{ name: string; kind: "flp" | "zip"; dropAt: number }> = ({ name, kind, dropAt }) => {
  const frame = useCurrentFrame();
  const fly = interpolate(frame, [dropAt - 24, dropAt], [0, 1], { ...clamp, easing: Easing.bezier(0.3, 0, 0.2, 1) });
  const gone = interpolate(frame, [dropAt, dropAt + 10], [0, 1], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: 760,
        top: 420,
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "22px 30px 22px 22px",
        borderRadius: 22,
        background: "rgba(34, 40, 52, 0.92)",
        boxShadow: "0 0 0 1px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.16), 0 40px 80px -20px rgba(0,0,0,0.9)",
        fontFamily: FONT,
        color: C.text,
        opacity: fly * (1 - gone),
        translate: `${(1 - fly) * 520}px ${(1 - fly) * -260}px`,
        rotate: `${(1 - fly) * 8}deg`,
        scale: 1 - gone * 0.4,
      }}
    >
      <div
        style={{
          width: 64,
          height: 78,
          borderRadius: 12,
          display: "grid",
          placeItems: "center",
          background: kind === "flp" ? CHANNEL_COLORS[1] : CHANNEL_COLORS[6],
          color: "#0e1116",
          fontWeight: 700,
          fontSize: 22,
          fontStretch: "80%",
        }}
      >
        {kind === "flp" ? ".flp" : ".zip"}
      </div>
      <div style={{ fontSize: 32, fontWeight: 600, fontStretch: "90%" }}>{name}</div>
    </div>
  );
};

/** A short label pinned to the bottom-left of a shot. */
export const Caption: React.FC<{ children: React.ReactNode; delay?: number; duration: number; top?: boolean }> = ({ children, delay = 0, duration, top }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [delay, delay + 16, duration - 10, duration], [0, 1, 1, 0], { ...clamp, easing: out });
  return (
    <div
      style={{
        position: "absolute",
        left: 96,
        ...(top ? { top: 84 } : { bottom: 84 }),
        padding: "18px 28px",
        borderRadius: 16,
        background: "rgba(20, 25, 34, 0.86)",
        boxShadow: "0 0 0 1px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12), 0 30px 60px -20px rgba(0,0,0,0.8)",
        fontFamily: FONT,
        fontSize: 40,
        fontWeight: 600,
        fontStretch: "88%",
        color: C.text,
        opacity: t,
        translate: `0 ${(1 - t) * 24}px`,
      }}
    >
      {children}
    </div>
  );
};

/** The space bar, pressed on the last frame of its card: the beat starts on the cut. */
export const SpaceKey: React.FC<{ pressAt: number }> = ({ pressAt }) => {
  const frame = useCurrentFrame();
  const down = interpolate(frame, [pressAt - 4, pressAt], [0, 1], clamp);
  return (
    <Fade delay={10}>
      <div
        style={{
          marginTop: 56,
          width: 620,
          height: 120,
          borderRadius: 24,
          display: "grid",
          placeItems: "center",
          background: `linear-gradient(#2a3140, #1c222c)`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.16), 0 ${10 - down * 8}px 0 rgba(0,0,0,0.65), 0 0 ${down * 80}px -10px rgba(170,205,255,${down * 0.6})`,
          translate: `0 ${down * 8}px`,
          fontFamily: FONT,
          fontSize: 38,
          fontWeight: 600,
          color: C.text2,
        }}
      >
        Space
      </div>
    </Fade>
  );
};
