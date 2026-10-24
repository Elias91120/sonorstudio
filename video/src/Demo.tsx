import React from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Easing, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Background, Caption, Card, Fade, FileChip, RiseLine, SpaceKey, StepRow } from "./parts";
import { Screen } from "./Screen";
import { C, CHANNEL_COLORS, FONT, sec } from "./theme";

/**
 * SonorStudio's demo film. Text cards are pauses that say one thing; between them, the real studio, filmed.
 * The beat (rendered by the studio itself with the kit) starts on the cut after the space bar.
 *
 * Capture timeline (seconds into footage.mp4): .flp dropped 2.0, kit dropped 6.54, kit linked 7.65,
 * arranging 10.15, play 14.74 (sound from 14.88), piano roll 21.23, mixer 27.76, back to the rack 34.29.
 */

// Hi-hats of PAV's pattern on a 16-step row, and its kicks: the motif of the intro and outro.
const HATS = [0, 3, 6, 8, 11, 14];
const KICKS = [0, 10, 13];

const T = {
  intro: [0, sec(3.5)],
  cardFlp: [sec(3.5), sec(2.5)],
  shotFlp: [sec(6), sec(5)],
  cardKit: [sec(11), sec(3)],
  shotKit: [sec(14), sec(4.5)],
  cardArrange: [sec(18.5), sec(2)],
  shotArrange: [sec(20.5), sec(4.5)],
  cardSpace: [sec(25), sec(2.5)],
  play: [sec(27.5), sec(26)],
  outro: [sec(53.5), sec(5.5)],
} as const;

export const DEMO_DURATION = T.outro[0] + T.outro[1];

export const Demo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.void }}>
    <Background />

    <Sequence name="Intro" from={T.intro[0]} durationInFrames={T.intro[1]}>
      <Intro />
    </Sequence>
    <Sequence name="Teaser audio" from={0} durationInFrames={sec(6.5)}>
      <Audio src={staticFile("teaser.wav")} />
    </Sequence>

    <Sequence name="Card .flp" from={T.cardFlp[0]} durationInFrames={T.cardFlp[1]}>
      <Card lines={["Got a beat", "in a .flp file?"]} sub="Drop it on the studio." duration={T.cardFlp[1]} />
    </Sequence>

    <Sequence name="Shot: .flp" from={T.shotFlp[0]} durationInFrames={T.shotFlp[1]}>
      <Screen
        from={1}
        duration={T.shotFlp[1]}
        shots={[
          { at: 0, x: 960, y: 540, zoom: 0.9 },
          { at: 1.3, x: 960, y: 540, zoom: 0.9 },
          { at: 2.4, x: 1470, y: 640, zoom: 1.4 },
          { at: 4, x: 1320, y: 760, zoom: 1.3 },
        ]}
      />
      <FileChip name="2 UK Drill Drum Patterns.flp" kind="flp" dropAt={sec(1)} />
      <Caption delay={sec(2.2)} duration={T.shotFlp[1]} top>
        Tempo, channels, patterns and mixer come in
      </Caption>
    </Sequence>

    <Sequence name="Card kit" from={T.cardKit[0]} durationInFrames={T.cardKit[1]}>
      <Card lines={["No kit?", "It still plays."]} sub="Built-in sounds stand in. Drop the kit, and every channel finds its sample by name." duration={T.cardKit[1]} />
    </Sequence>

    <Sequence name="Shot: kit" from={T.shotKit[0]} durationInFrames={T.shotKit[1]}>
      <Screen
        from={5.7}
        duration={T.shotKit[1]}
        shots={[
          { at: 0, x: 1250, y: 680, zoom: 1.25 },
          { at: 1.4, x: 1250, y: 680, zoom: 1.3 },
          { at: 2.6, x: 1260, y: 640, zoom: 1.75 },
          { at: 4.5, x: 1280, y: 640, zoom: 1.8 },
        ]}
      />
      <FileChip name="GASSED UK Drill Drum Kit.zip" kind="zip" dropAt={sec(0.84)} />
      <Caption delay={sec(1.8)} duration={T.shotKit[1]}>
        30 sounds in, 9 channels linked
      </Caption>
    </Sequence>

    <Sequence name="Card arrange" from={T.cardArrange[0]} durationInFrames={T.cardArrange[1]}>
      <Card lines={["Arrange it."]} sub="Patterns become a song in the playlist." duration={T.cardArrange[1]} />
    </Sequence>

    <Sequence name="Shot: arrange" from={T.shotArrange[0]} durationInFrames={T.shotArrange[1]}>
      <Screen
        from={10}
        duration={T.shotArrange[1]}
        shots={[
          { at: 0, x: 900, y: 300, zoom: 1.2 },
          { at: 3.8, x: 980, y: 260, zoom: 1.55 },
        ]}
      />
    </Sequence>

    <Sequence name="Card space" from={T.cardSpace[0]} durationInFrames={T.cardSpace[1]}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <RiseLine size={170}>Then press Space.</RiseLine>
        <SpaceKey pressAt={T.cardSpace[1] - 1} />
      </AbsoluteFill>
    </Sequence>
    <Sequence name="Riser" from={T.play[0] - sec(2.2)} durationInFrames={sec(2.2)}>
      <Audio src={staticFile("riser.wav")} />
    </Sequence>

    <Sequence name="Shot: play" from={T.play[0]} durationInFrames={T.play[1]}>
      <Screen
        from={14.87}
        duration={T.play[1]}
        shots={[
          { at: 0, x: 960, y: 540, zoom: 0.94 },
          { at: 3.2, x: 1000, y: 330, zoom: 1.2 },
          { at: 6.2, x: 1000, y: 330, zoom: 1.22 },
          { at: 7.2, x: 886, y: 456, zoom: 1.45 },
          { at: 12.7, x: 886, y: 440, zoom: 1.5 },
          { at: 13.7, x: 1006, y: 736, zoom: 1.4 },
          { at: 19.2, x: 1006, y: 720, zoom: 1.45 },
          { at: 20.2, x: 1476, y: 636, zoom: 1.5 },
          { at: 23.6, x: 1460, y: 640, zoom: 1.55 },
          { at: 25.4, x: 960, y: 540, zoom: 0.94 },
        ]}
      />
      <Caption delay={sec(0.8)} duration={sec(5.6)}>
        16 bars at 148 BPM, played by your browser
      </Caption>
      <Sequence from={sec(6.8)} durationInFrames={sec(6)} layout="none">
        <Caption duration={sec(6)}>Piano roll: the 808 line</Caption>
      </Sequence>
      <Sequence from={sec(13.4)} durationInFrames={sec(6)} layout="none">
        <Caption duration={sec(6)}>Mixer: every channel on its own insert</Caption>
      </Sequence>
      <Sequence from={sec(19.9)} durationInFrames={sec(4.6)} layout="none">
        <Caption duration={sec(4.6)}>Channel rack</Caption>
      </Sequence>
    </Sequence>
    <Sequence name="Beat" from={T.play[0]}>
      <Audio src={staticFile("beat.wav")} />
    </Sequence>

    <Sequence name="Outro" from={T.outro[0]} durationInFrames={T.outro[1]}>
      <Outro />
    </Sequence>
  </AbsoluteFill>
);

const Logo: React.FC<{ size?: number }> = ({ size = 72 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.3 }}>
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(#2a3140, #1a1f29)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16), 0 0 0 1px rgba(0,0,0,0.5)",
        color: C.lamp,
      }}
    >
      <svg width={size * 0.55} height={size * 0.48} viewBox="0 0 16 14" fill="currentColor">
        <rect x="0.5" y="3.5" width="2.8" height="7" rx="1.4" />
        <rect x="4.6" y="0" width="2.8" height="14" rx="1.4" />
        <rect x="8.7" y="1.4" width="2.8" height="11.2" rx="1.4" />
        <rect x="12.8" y="4.2" width="2.8" height="5.6" rx="1.4" />
      </svg>
    </div>
    <div style={{ fontFamily: FONT, fontSize: size * 0.62, fontWeight: 650, fontStretch: "90%", color: C.text }}>SonorStudio</div>
  </div>
);

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const leave = interpolate(frame, [sec(3.2), sec(3.5)], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 160px", gap: 56, opacity: leave }}>
      <Fade>
        <Logo />
      </Fade>
      <div>
        <RiseLine delay={10} size={170}>
          Make beats
        </RiseLine>
        <RiseLine delay={16} size={170}>
          in your browser.
        </RiseLine>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <StepRow hits={HATS} color={CHANNEL_COLORS[4]} size={40} delay={20} />
        <StepRow hits={KICKS} color={CHANNEL_COLORS[0]} size={40} delay={24} />
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => (
  <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", gap: 40 }}>
    <Fade>
      <Logo size={80} />
    </Fade>
    <div>
      <RiseLine delay={6} size={150}>
        Free. Nothing to install.
      </RiseLine>
    </div>
    <Fade delay={18}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "26px 52px",
          borderRadius: 999,
          background: C.lamp,
          color: "#0e1116",
          fontFamily: FONT,
          fontSize: 44,
          fontWeight: 650,
          boxShadow: "0 0 0 1px rgba(255,255,255,0.2), 0 20px 60px -16px rgba(170,205,255,0.55)",
        }}
      >
        sonorstudio.vercel.app
      </div>
    </Fade>
    <Fade delay={30} style={{ fontFamily: FONT, fontSize: 26, color: C.text3, lineHeight: 1.5, marginTop: 24 }}>
      Drum patterns designed by PAV Music Production
      <br />
      GASSED UK Drill Drum Kit by Producergrind
    </Fade>
  </AbsoluteFill>
);
