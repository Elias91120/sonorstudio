import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

export const FONT = "Instrument Sans";

// The variable file carries the width axis: 75% is the condensed display cut the landing page uses.
loadFont({
  family: FONT,
  url: staticFile("InstrumentSans-wdth.woff2"),
  weight: "400 700",
  stretch: "75% 100%",
});

export const C = {
  void: "#0c0f14",
  floor: "#141922",
  text: "#e6ebf2",
  text2: "#a3adbc",
  text3: "#7d889a",
  lamp: "#eaf2ff",
  accent: "#78aeff",
};

/** The studio's channel colors, in channel order. */
export const CHANNEL_COLORS = ["#f26d5f", "#f39a4c", "#ebc652", "#a8d15e", "#5ecf9e", "#4ec8d6", "#5faef5", "#8a8df5", "#b88af2"];

export const FPS = 30;
export const BPM = 148;
export const STEP_FRAMES = (60 / BPM / 4) * FPS;
export const sec = (s: number) => Math.round(s * FPS);
