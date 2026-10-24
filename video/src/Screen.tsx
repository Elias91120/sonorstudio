import React from "react";
import { Video } from "@remotion/media";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { sec } from "./theme";

/** A camera position on the 1920×1080 capture: what to center and how close. */
export interface Shot {
  /** Seconds into this shot. */
  at: number;
  x: number;
  y: number;
  zoom: number;
}

const ease = Easing.bezier(0.45, 0, 0.2, 1);

function camera(shots: Shot[], frame: number) {
  const frames = shots.map((s) => sec(s.at));
  const opts = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease } as const;
  // Interpolate segment by segment so every move gets its own ease in and out.
  let i = 0;
  while (i < frames.length - 2 && frame > frames[i + 1]) i++;
  const a = shots[i];
  const b = shots[Math.min(i + 1, shots.length - 1)];
  const range = [frames[i], Math.max(frames[i] + 1, frames[Math.min(i + 1, frames.length - 1)])];
  return {
    x: interpolate(frame, range, [a.x, b.x], opts),
    y: interpolate(frame, range, [a.y, b.y], opts),
    zoom: interpolate(frame, range, [a.zoom, b.zoom], opts),
  };
}

/** The real studio, filmed: the capture played from `from` seconds, framed like a window on the slate, with camera moves. */
export const Screen: React.FC<{ from: number; shots: Shot[]; duration: number }> = ({ from, shots, duration }) => {
  const frame = useCurrentFrame();
  const { x, y, zoom } = camera(shots, frame);
  const enter = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const leave = interpolate(frame, [duration - 8, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: enter * leave }}>
      <div
        style={{
          position: "absolute",
          width: 1920,
          height: 1080,
          left: 0,
          top: 0,
          translate: `${(960 - x) * zoom}px ${(540 - y) * zoom}px`,
          scale: zoom * (0.96 + 0.04 * enter),
          borderRadius: 18 / zoom,
          overflow: "hidden",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.7), 0 0 0 2px rgba(255,255,255,0.06), 0 60px 140px -30px rgba(0,0,0,0.95)",
        }}
      >
        <Video src={staticFile("footage.mp4")} trimBefore={sec(from)} muted style={{ width: 1920, height: 1080 }} />
      </div>
    </AbsoluteFill>
  );
};
