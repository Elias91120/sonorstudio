import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { create } from 'zustand';

export type MenuItem =
  | { label: string; onSelect: () => void; disabled?: boolean; shortcut?: string; danger?: boolean }
  | { separator: true };

interface PromptState {
  title: string;
  value: string;
  confirm: string;
  resolve: (v: string | null) => void;
}

interface OverlayState {
  menu: { x: number; y: number; items: MenuItem[] } | null;
  prompt: PromptState | null;
}

export const useOverlay = create<OverlayState>(() => ({ menu: null, prompt: null }));

export function openMenu(at: { clientX: number; clientY: number }, items: MenuItem[]) {
  useOverlay.setState({ menu: { x: at.clientX, y: at.clientY, items } });
}

/** Opens a menu under an element, aligned to its left edge. */
export function openMenuBelow(el: Element, items: MenuItem[]) {
  const r = el.getBoundingClientRect();
  openMenu({ clientX: r.left, clientY: r.bottom + 4 }, items);
}

export const closeMenu = () => useOverlay.setState({ menu: null });

export function askText(title: string, value: string, confirm = 'Rename'): Promise<string | null> {
  return new Promise((resolve) => useOverlay.setState({ prompt: { title, value, confirm, resolve } }));
}

export function ContextMenuHost() {
  const menu = useOverlay((s) => s.menu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!menu || !el) {
      setPos(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const x = Math.max(6, Math.min(menu.x, window.innerWidth - r.width - 6));
    const y = menu.y + r.height > window.innerHeight - 6 ? Math.max(6, menu.y - r.height) : menu.y;
    setPos({ x, y });
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      // The menu owns the keyboard while it is open.
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
      next?.focus();
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', closeMenu);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', closeMenu);
      window.removeEventListener('resize', closeMenu);
    };
  }, [menu]);

  if (!menu) return null;
  return (
    <div
      className="menu"
      role="menu"
      ref={ref}
      style={{ left: pos?.x ?? menu.x, top: pos?.y ?? menu.y, visibility: pos ? 'visible' : 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item, i) =>
        'separator' in item ? (
          <div key={i} className="menu-sep" role="separator" />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={`menu-item${item.danger ? ' is-danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              closeMenu();
              item.onSelect();
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}

export function PromptHost() {
  const prompt = useOverlay((s) => s.prompt);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!prompt) return;
    setValue(prompt.value);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [prompt]);

  if (!prompt) return null;
  const done = (v: string | null) => {
    useOverlay.setState({ prompt: null });
    prompt.resolve(v === null ? null : v.trim() || null);
  };
  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) done(null);
      }}
    >
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-title"
        onSubmit={(e) => {
          e.preventDefault();
          done(value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') done(null);
        }}
      >
        <h2 id="prompt-title">{prompt.title}</h2>
        <input ref={inputRef} value={value} maxLength={48} onChange={(e) => setValue(e.target.value)} aria-labelledby="prompt-title" />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => done(null)}>
            Cancel
          </button>
          <button type="submit" className="btn is-primary">
            {prompt.confirm}
          </button>
        </div>
      </form>
    </div>
  );
}
