import { describeImport, importFiles, type ImportResult, type IncomingFile } from '../audio/userSamples';
import { addSampleChannels } from '../state/actions';
import { setHint } from './hint';

/** Imports files into the library and tells the hint bar how it went. Never rejects. */
export async function importSounds(files: Iterable<File | IncomingFile>): Promise<ImportResult | null> {
  const list = Array.from(files, (f) => (f instanceof File ? { file: f } : f));
  if (!list.length) return null;
  setHint(list.length === 1 ? `Importing ${list[0].file.name}…` : `Importing ${list.length} files…`);
  try {
    const result = await importFiles(list);
    setHint(describeImport(result));
    return result;
  } catch (err) {
    setHint(`The import stopped: ${err instanceof Error ? err.message : 'unknown error'}. Your library is unchanged.`);
    return null;
  }
}

/** Files dropped on the rack: every sound gets a channel, in drop order; the first may take over the row it landed on. */
export async function importToRack(files: Iterable<File | IncomingFile>, replaceId?: string) {
  const result = await importSounds(files);
  if (result?.ordered.length) addSampleChannels(result.ordered.map((s) => s.id), replaceId);
}

/**
 * Every file of a drop, walking into dropped folders: a sample pack usually arrives as a folder.
 * Files inside a folder keep it ("Vinyl kit/Kicks") so the library shows the kit like a zip.
 */
export function droppedFiles(dt: DataTransfer): Promise<IncomingFile[]> {
  // Entries must be taken during the drop event itself: the browser empties the DataTransfer right after.
  const entries = Array.from(dt.items ?? [], (item) => (item.kind === 'file' ? item.webkitGetAsEntry?.() : null));
  const files = Array.from(dt.files, (file) => ({ file }));
  if (!entries.some((e) => e?.isDirectory)) return Promise.resolve(files);
  return (async () => {
    const out: IncomingFile[] = [];
    for (const entry of entries) if (entry) await walk(entry, '', out);
    return out;
  })();
}

async function walk(entry: FileSystemEntry, parent: string, out: IncomingFile[]) {
  if (entry.name.startsWith('.') || entry.name === '__MACOSX') return;
  try {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      out.push(parent ? { file, folder: parent } : { file });
      return;
    }
    if (!entry.isDirectory) return;
    const folder = parent ? `${parent}/${entry.name}` : entry.name;
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries hands out at most about a hundred entries per call: keep asking until it comes back empty.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) await walk(child, folder, out);
    }
  } catch {
    // An entry the browser cannot open (permissions, a vanished file): the rest of the drop still counts.
  }
}

/** A file dropped outside a drop zone would otherwise make the browser leave the app and open the file. */
export function guardFileDrops() {
  const isFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
  window.addEventListener('dragover', (e) => {
    if (isFiles(e)) e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    if (isFiles(e)) e.preventDefault();
  });
}
