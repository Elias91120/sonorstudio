// Films the studio for the demo video and renders the beat with the kit (see ../src/Demo.tsx for the edit).
// Needs the dev server on :5173. Usage: node capture.mjs <kit.zip> <project.flp> <out dir>, then python concat.py <out dir>
// and ffmpeg (see concat.py) to turn the frames into footage.mp4. The Chromium path is a local Playwright install.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const [, , kitZip, flp, outDir] = process.argv;
mkdirSync(`${outDir}/frames`, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Users/eello/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  args: ['--autoplay-policy=no-user-gesture-required', '--force-device-scale-factor=1'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173/studio/');
await page.evaluate(async () => {
  localStorage.clear();
  await new Promise((r) => { const q = indexedDB.deleteDatabase('sonorstudio'); q.onsuccess = q.onerror = q.onblocked = r; });
});
await page.reload();
await page.waitForTimeout(1500);
// A fresh, empty project, the rack out of the playlist's way.
await page.evaluate(async () => {
  const f = await import('/src/ui/fileActions.ts');
  f.newProject();
  const st = window.__sonor.useStudio.getState();
  st.setWindowRect('channelRack', { x: 820, y: 300, w: 840, h: 560 });
  st.focusWindow('channelRack');
});
await page.mouse.click(5, 1075); // unlock audio
await page.waitForTimeout(800);

const drop = async (path, name) => {
  const b64 = readFileSync(path).toString('base64');
  const dt = await page.evaluateHandle(({ b64, name }) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const d = new DataTransfer();
    d.items.add(new File([bytes], name));
    return d;
  }, { b64, name });
  await page.dispatchEvent('.workspace', 'drop', { dataTransfer: dt });
};

const cdp = await page.context().newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const i = frames.length;
  frames.push(metadata.timestamp);
  writeFileSync(`${outDir}/frames/${String(i).padStart(5, '0')}.jpg`, Buffer.from(data, 'base64'));
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
const events = {};
const mark = (k) => (events[k] = Date.now() / 1000);
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
mark('start');
// Keep frames flowing even when nothing moves: a 1px element that changes every frame.
await page.evaluate(() => {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;z-index:99999;pointer-events:none';
  document.body.append(d);
  let n = 0;
  const tick = () => { d.style.background = n++ % 2 ? '#0c0f14' : '#0c0f15'; requestAnimationFrame(tick); };
  tick();
});
await page.waitForTimeout(2000);

mark('flp');
await drop(flp, '2 UK Drill Drum Patterns.flp');
await page.waitForTimeout(4500);

mark('kit');
await drop(kitZip, 'GASSED UK Drill Drum Kit (Producergrind).zip');
await page.waitForFunction(() => !document.querySelector('.kit-banner'), null, { timeout: 30000 });
mark('kitDone');
await page.waitForTimeout(2500);

// Arrange A A B B twice in the playlist, clip by clip, like painting them.
mark('arrange');
await page.evaluate(async () => {
  const st = window.__sonor.useStudio.getState();
  const [a, b] = st.project.patterns;
  st.commit((d) => { d.tracks[0].name = 'Pattern 1'; d.tracks[1].name = 'Pattern 2'; });
  const order = [0, 0, 1, 1, 0, 0, 1, 1];
  for (let i = 0; i < order.length; i++) {
    const p = order[i] ? b : a;
    window.__sonor.useStudio.getState().commit((d) => {
      d.clips.push({ id: `clip_v${i}`, patternId: p.id, track: order[i], pos: i * 768, len: 768, offset: 0, muted: false });
    });
    await new Promise((r) => setTimeout(r, 380));
  }
  window.__sonor.useStudio.getState().setMode('song');
});
await page.waitForTimeout(1500);

// Play the song: 16 bars at 148 BPM.
const BAR = (60 / 148) * 4 * 1000;
mark('play');
await page.evaluate(() => window.__sonor.engine.play());
await page.waitForTimeout(BAR * 4);
mark('pianoRoll');
await page.evaluate(() => {
  const st = window.__sonor.useStudio.getState();
  const bass = st.project.channels.find((c) => /808/.test(c.name));
  st.selectChannel(bass.id);
  st.setCurrentPattern(st.project.patterns[0].id);
  st.setWindowRect('pianoRoll', { x: 60, y: 120, w: 1180, h: 560 });
  st.openWindow('pianoRoll');
});
await page.waitForTimeout(BAR * 4);
mark('mixer');
await page.evaluate(() => {
  const st = window.__sonor.useStudio.getState();
  st.setWindowRect('mixer', { x: 120, y: 380, w: 1300, h: 600 });
  st.openWindow('mixer');
});
await page.waitForTimeout(BAR * 4);
mark('rack');
await page.evaluate(() => {
  const st = window.__sonor.useStudio.getState();
  st.closeWindow('pianoRoll');
  st.closeWindow('mixer');
  st.focusWindow('channelRack');
});
await page.waitForTimeout(BAR * 4 + 1200);
mark('end');
await page.evaluate(() => window.__sonor.engine.stop());
await page.waitForTimeout(500);
await cdp.send('Page.stopScreencast');

// The audio, rendered offline by the studio itself with the kit.
const wav = await page.evaluate(async () => {
  const { renderProject, encodeWav } = await import('/src/audio/exportWav.ts');
  const st = window.__sonor.useStudio.getState();
  const buf = await renderProject(st.project, 'song', st.currentPatternId);
  const blob = encodeWav(buf);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
});
writeFileSync(`${outDir}/beat.wav`, Buffer.from(wav, 'base64'));
writeFileSync(`${outDir}/frames.json`, JSON.stringify({ frames, events }));
console.log('frames', frames.length, 'events', events, 'errors', errors);
await browser.close();
