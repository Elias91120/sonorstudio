import { useState, type ReactNode } from 'react';
import { engine } from '../audio/engine';
import { SOUNDS, SOUND_CATEGORIES } from '../audio/sounds';
import { PRESET_NAMES, presetParams } from '../core/presets';
import { addChannel, type LibraryItem } from '../state/actions';
import { setDragItem } from './dnd';
import { IconChevron, IconKeys, IconWave } from './icons';

export function Browser() {
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const q = query.trim().toLowerCase();
  const match = (name: string) => !q || name.toLowerCase().includes(q);
  const groups = SOUND_CATEGORIES.map((cat) => ({ cat, items: SOUNDS.filter((s) => s.category === cat && match(s.name)) })).filter(
    (g) => g.items.length > 0,
  );
  const presets = PRESET_NAMES.filter(match);
  const toggle = (key: string) => setClosed((c) => ({ ...c, [key]: !c[key] }));
  const isOpen = (key: string) => q !== '' || !closed[key];

  return (
    <aside className="browser" aria-label="Browser">
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
        {groups.length === 0 && presets.length === 0 && <p className="br-empty">Nothing matches “{query}”. Try kick, hat or bass.</p>}
      </div>
      <p className="br-foot">Click to listen. Drag onto the channel rack, or double-click to add a channel.</p>
    </aside>
  );
}

function Folder({ name, count, open, onToggle, children }: { name: string; count: number; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="br-folder">
      <button className="br-folder-head" aria-expanded={open} onClick={onToggle}>
        <IconChevron open={open} />
        <span className="br-folder-name">{name}</span>
        <span className="br-count">{count}</span>
      </button>
      {open && <div className="br-items">{children}</div>}
    </div>
  );
}

function Item({ name, icon, item, onPreview }: { name: string; icon: ReactNode; item: LibraryItem; onPreview: () => void }) {
  return (
    <div
      className="br-item"
      role="button"
      tabIndex={0}
      draggable
      data-hint={`${name}: click to listen, double-click to add`}
      onDragStart={(e) => setDragItem(e, item)}
      onClick={onPreview}
      onDoubleClick={() => addChannel(item)}
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
