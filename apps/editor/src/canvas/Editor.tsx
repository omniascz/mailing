'use client';

import { useEffect, useMemo, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import type { BlockType, EmailSchema } from '../schema/blocks.js';
import { createEmptyEmail } from '../schema/factory.js';
import { renderEmail, type MergeTagContext } from '../render/index.js';
import { BlockPalette } from './BlockPalette.js';
import { Canvas } from './Canvas.js';
import { PropertyEditor } from './PropertyEditor.js';
import { Toolbar } from './Toolbar.js';
import { useEditor, type BlockPath, type PathKey } from './store.js';

interface EditorProps {
  initialEmail?: EmailSchema;
  previewContext?: MergeTagContext;
  onChange?: (email: EmailSchema) => void;
}

/**
 * Full email editor composition. Wires the DnD context, store, palette,
 * canvas, property editor and toolbar together. The `onChange` callback lets
 * parents persist edits (e.g. autosave) without owning the reducer state.
 */
export function Editor({ initialEmail, previewContext, onChange }: EditorProps) {
  const startEmail = useMemo(() => initialEmail ?? createEmptyEmail(), [initialEmail]);
  const { state, actions, selectedBlock, canUndo, canRedo } = useEditor(startEmail);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [previewAllDynamic, setPreviewAllDynamic] = useState(true);

  // Notify parent on any email change so they can persist.
  useEffect(() => {
    onChange?.(state.email);
  }, [state.email, onChange]);

  // Keyboard shortcuts for undo/redo.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        actions.undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        actions.redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [actions]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const overData = over.data.current as
      | { target: 'dropzone'; parentPath: BlockPath; parentKey: PathKey; index: number }
      | undefined;
    if (!overData || overData.target !== 'dropzone') return;

    const activeData = active.data.current as
      | { source: 'palette'; blockType: BlockType }
      | { source: 'block'; path: BlockPath }
      | undefined;
    if (!activeData) return;

    if (activeData.source === 'palette') {
      actions.addBlock(activeData.blockType, {
        parentPath: overData.parentPath,
        parentKey: overData.parentKey,
        index: overData.index,
      });
    } else if (activeData.source === 'block') {
      actions.moveBlock(activeData.path, {
        parentPath: overData.parentPath,
        parentKey: overData.parentKey,
        index: overData.index,
      });
    }
  };

  const exportHtml = () => {
    const { html } = renderEmail(state.email, {
      context: previewContext,
      previewAllDynamicBranches: false,
    });
    const blob = new Blob([html], { type: 'text/html' });
    triggerDownload(blob, `${slugify(state.email.subject)}.html`);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state.email, null, 2)], {
      type: 'application/json',
    });
    triggerDownload(blob, `${slugify(state.email.subject)}.json`);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex h-screen flex-col">
        <Toolbar
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={actions.undo}
          onRedo={actions.redo}
          previewMode={previewMode}
          onTogglePreview={() => setPreviewMode((m) => (m === 'desktop' ? 'mobile' : 'desktop'))}
          previewAllDynamic={previewAllDynamic}
          onToggleDynamicPreview={() => setPreviewAllDynamic((v) => !v)}
          onExportHtml={exportHtml}
          onExportJson={exportJson}
        />
        <div className="flex min-h-0 flex-1">
          <aside className="w-60 shrink-0 overflow-y-auto border-r border-secondary-200 bg-secondary-50 p-3">
            <BlockPalette />
          </aside>
          <main
            className="flex-1 overflow-y-auto bg-secondary-100"
            style={{ maxWidth: previewMode === 'mobile' ? '420px' : undefined, margin: '0 auto' }}
          >
            <Canvas
              email={state.email}
              selectedPath={state.selectedPath}
              onSelect={actions.select}
              onRemove={actions.removeBlock}
            />
          </main>
          <aside className="w-72 shrink-0 overflow-y-auto border-l border-secondary-200 bg-white p-4">
            <PropertyEditor
              email={state.email}
              selectedPath={state.selectedPath}
              selectedBlock={selectedBlock}
              onUpdateBlock={actions.updateBlock}
              onUpdateEmail={actions.updateEmail}
            />
          </aside>
        </div>
      </div>
    </DndContext>
  );
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'email'
  );
}

function triggerDownload(blob: Blob, filename: string) {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
