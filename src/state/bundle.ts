/**
 * The .sonor.zip project format: project.json as in a .sonor.json file, the imported sounds the
 * project uses as sounds/<id>.<ext> with their original bytes, and sounds.json naming them.
 */

import { strFromU8, strToU8, zipSync, type Zippable } from 'fflate';
import {
  bundleCandidates,
  extFor,
  getUserSample,
  isUserSampleId,
  MANIFEST_ENTRY,
  PROJECT_ENTRY,
  toArrayBuffer,
  unzipCapped,
  type ManifestEntry,
  type SkippedFile,
  type SoundCandidate,
} from '../audio/userSamples';
import type { Project } from '../core/types';

export const PROJECT_ZIP_SUFFIX = '.sonor.zip';

export const isProjectZip = (file: File) => /\.zip$/i.test(file.name) || /zip/i.test(file.type);

/** Imported sample ids the project refers to, in channel order. */
export function bundledSampleIds(project: Project): string[] {
  const ids = project.channels.map((c) => c.sampler?.sampleId ?? '').filter(isUserSampleId);
  return [...new Set(ids)];
}

export function packProject(project: Project): { blob: Blob; sounds: number; missing: number } {
  const files: Zippable = { [PROJECT_ENTRY]: strToU8(JSON.stringify(project)) };
  const manifest: ManifestEntry[] = [];
  let missing = 0;
  for (const id of bundledSampleIds(project)) {
    const s = getUserSample(id);
    if (!s) {
      // A deleted sample cannot travel; the channel keeps its name, so the other side still gets the hint.
      missing++;
      continue;
    }
    const file = `sounds/${id}.${extFor(s.mime)}`;
    // Audio formats are already compressed, or big enough that deflating them would only cost time.
    files[file] = [new Uint8Array(s.bytes), { level: 0 }];
    manifest.push({ id, name: s.name, folder: s.folder, mime: s.mime, file });
  }
  files[MANIFEST_ENTRY] = strToU8(JSON.stringify(manifest));
  const zip = zipSync(files);
  return { blob: new Blob([toArrayBuffer(zip)], { type: 'application/zip' }), sounds: manifest.length, missing };
}

/**
 * Returns null when the zip holds no project. The sounds come back as candidates for the library;
 * `skipped` lists the ones the size caps kept out, checked before anything is inflated.
 */
export function unpackProject(data: Uint8Array): { project: unknown; sounds: SoundCandidate[]; skipped: SkippedFile[] } | null {
  let unzipped: ReturnType<typeof unzipCapped>;
  try {
    unzipped = unzipCapped(data);
  } catch {
    return null;
  }
  const { entries, skipped } = unzipped;
  if (!entries[PROJECT_ENTRY]) return null;
  let project: unknown;
  try {
    project = JSON.parse(strFromU8(entries[PROJECT_ENTRY]));
  } catch {
    return null;
  }
  return { project, sounds: bundleCandidates(entries, project), skipped };
}
