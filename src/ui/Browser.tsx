import { useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { engine } from '../audio/engine';
import { SOUNDS, SOUND_CATEGORIES } from '../audio/sounds';
import { groupByFolder, removeFolder, removeSample, renameSample, useUserSamples, type UserSample } from '../audio/userSamples';
import { PRESET_NAMES, presetParams } from '../core/presets';
import { addChannel, type LibraryItem } from '../state/actions';
import { hasFiles, setDragItem } from './dnd';
import { setHint } from './hint';
import { IconChevron, IconKeys, IconWave } from './icons';
import { droppedFiles, importSounds } from './importSounds';
import { askText, openMenu, openMenuBelow } from './overlay';

const IMPORT_ACCEPT = 'audio/*,.zip,.wav,.mp3,.ogg,.flac,.aif,.aiff,.m4a';

export function Browser() {
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [dropping, setDropping] = useState(false);
  const samples = useUserSamples((s) => s.samples);
  const q = query.trim().toLowerCase();
  const match = (name: string) => !q || name.toLowerCase().includes(q);
  const groups = SOUND_CATEGORIES.map((cat) => ({ cat, items: SOUNDS.filter((s) => s.category === cat && match(s.name)) })).filter(
    (g) => g.items.length > 0,
  );
  const presets = PRESET_NAMES.filter(match);
  const mine = groupByFolder(samples.filter((s) => match(s.name) || match(s.folder)));
  const toggle = (key: string) => setClosed((c) => ({ ...c, [key]: !c[key] }));
  const isOpen = (key: string) => q !== '' || !closed[key];
  const nothing = groups.length === 0 && presets.length === 0 && mine.length === 0;

  const onDragOver = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropping(true);
  };
  const onDragLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
  };
  const onDrop = (e: DragEvent) => {
    setDropping(false);
    if (!hasFiles(e)) return;
    e.preventDefault();
    void droppedFiles(e.dataTransfer).then(importSounds);
  };

  return (
    <aside className={`browser${dropping ? ' is-drop' : ''}`} aria-label="Browser" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <div className="br-head">
        <input
          className="br-search"
          type="search"
          placeholder="Search sounds"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search sounds"
        />
      </div>
      <div className="br-scroll">
        {groups.length > 0 && <h2 className="br-section">Sounds</h2>}
        {groups.map(({ cat, items }) => (
          <Folder key={cat} name={cat} count={items.length} open={isOpen(cat)} onToggle={() => toggle(cat)}>
            {items.map((s) => (
              <Item
                key={s.id}
                name={s.name}
                icon={<IconWave />}
                item={{ kind: 'sample', id: s.id }}
                onPreview={() => engine.previewSound(s.id)}
              />
            ))}
          </Folder>
        ))}
        {presets.length > 0 && (
          <>
            <h2 className="br-section">Instruments</h2>
            <Folder name="Synth presets" count={presets.length} open={isOpen('synths')} onToggle={() => toggle('synths')}>
              {presets.map((name) => (
                <Item
                  key={name}
                  name={name}
                  icon={<IconKeys />}
                  item={{ kind: 'synth', preset: name }}
                  onPreview={() => engine.previewSynth(presetParams(name))}
                />
              ))}
            </Folder>
          </>
        )}
        <MySounds groups={mine} empty={samples.length === 0} searching={q !== ''} isOpen={isOpen} toggle={toggle} />
        {nothing && <p className="br-empty">Nothing matches “{query}”. Try kick, hat or bass.</p>}
      </div>
      <p className="br-foot">Click to listen. Drag onto the channel rack, or double-click to add a channel.</p>
    </aside>
  );
}

interface MySoundsProps {
  groups: { folder: string; items: UserSample[] }[];
  empty: boolean;
  searching: boolean;
  isOpen: (key: string) => boolean;
  toggle: (key: string) => void;
}

function MySounds({ groups, empty, searching, isOpen, toggle }: MySoundsProps) {
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  // The section stays hidden while a search matches nothing of the user's, unless there is nothing to search.
  if (searching && groups.length === 0 && !empty) return null;
  return (
    <div className="br-user">
      <div className="br-section-row">
        <h2 className="br-section">My sounds</h2>
        <button
          className="btn"
          aria-haspopup="menu"
          data-hint="Import WAV, MP3, OGG, FLAC, AIFF files, a folder or a .zip of a drum kit"
          onClick={(e) =>
            openMenuBelow(e.currentTarget, [
              { label: 'Files or a .zip…', onSelect: () => input.current?.click() },
              { label: 'A whole folder…', onSelect: () => folderInput.current?.click() },
            ])
          }
        >
          Import sounds
        </button>
        <input
          // React has no prop for folder picking; the attribute is set on the element itself.
          ref={(el) => {
            folderInput.current = el;
            el?.setAttribute('webkitdirectory', '');
          }}
          className="br-import-folder"
          type="file"
          hidden
          aria-label="Import a folder of sounds"
          onChange={(e) => {
            const files = e.currentTarget.files;
            if (files?.length) void importSounds(files);
            e.currentTarget.value = '';
          }}
        />
        <input
          ref={input}
          className="br-import-input"
          type="file"
          multiple
          hidden
          accept={IMPORT_ACCEPT}
          aria-label="Import sounds"
          onChange={(e) => {
            const files = e.currentTarget.files;
            if (files?.length) void importSounds(files);
            // Picking the same file again must still trigger a change event.
            e.currentTarget.value = '';
          }}
        />
      </div>
      <p className="br-drop">
        {empty ? 'No sounds of your own yet. Drop your WAV, MP3 or a .zip of a drum kit here, or click Import sounds.' : 'Drop audio files or a .zip here'}
      </p>
      {groups.map(({ folder, items }) => (
        <Folder
          key={folder}
          name={folder}
          count={items.length}
          open={isOpen(`user:${folder}`)}
          onToggle={() => toggle(`user:${folder}`)}
          onContextMenu={(e) =>
            openMenu(e, [
              {
                label: `Delete folder (${items.length} sound${items.length === 1 ? '' : 's'})`,
                danger: true,
                onSelect: () => void removeFolder(folder).then((n) => setHint(`${folder} deleted: ${n} sound${n === 1 ? '' : 's'} removed from your library.`)),
              },
            ])
          }
        >
          {items.map((s) => (
            <Item
              key={s.id}
              name={s.name}
              icon={<IconWave />}
              item={{ kind: 'sample', id: s.id }}
              onPreview={() => engine.previewSound(s.id)}
              onContextMenu={(e) =>
                openMenu(e, [
                  {
                    label: 'Rename…',
                    onSelect: async () => {
                      const name = await askText('Rename sound', s.name);
                      if (name) void renameSample(s.id, name);
                    },
                  },
                  { separator: true },
                  {
                    label: 'Delete from library',
                    danger: true,
                    onSelect: () => void removeSample(s.id).then(() => setHint(`${s.name} removed from your library. Channels using it stay, silent.`)),
                  },
                ])
              }
            />
          ))}
        </Folder>
      ))}
    </div>
  );
}

interface FolderProps {
  name: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  children: ReactNode;
}

function Folder({ name, count, open, onToggle, onContextMenu, children }: FolderProps) {
  return (
    <div className="br-folder">
      <button
        className="br-folder-head"
        aria-expanded={open}
        onClick={onToggle}
        onContextMenu={
          onContextMenu &&
          ((e) => {
            e.preventDefault();
            onContextMenu(e);
          })
        }
      >
        <IconChevron open={open} />
        <span className="br-folder-name">{name}</span>
        <span className="br-count">{count}</span>
      </button>
      {open && <div className="br-items">{children}</div>}
    </div>
  );
}

interface ItemProps {
  name: string;
  icon: ReactNode;
  item: LibraryItem;
  onPreview: () => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
}

function Item({ name, icon, item, onPreview, onContextMenu }: ItemProps) {
  return (
    <div
      className="br-item"
      role="button"
      tabIndex={0}
      draggable
      data-hint={`${name}: click to listen, double-click to add${onContextMenu ? ', right-click to rename or delete' : ''}`}
      onDragStart={(e) => setDragItem(e, item)}
      onClick={onPreview}
      onDoubleClick={() => addChannel(item)}
      onContextMenu={
        onContextMenu &&
        ((e) => {
          e.preventDefault();
          onContextMenu(e);
        })
      }
      onKeyDown={(e) => {
        if (e.key === 'Enter') addChannel(item);
        else if (e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onPreview();
        }
      }}
    >
      {icon}
      <span>{name}</span>
    </div>
  );
}
