'use client';

import { useDraggable } from '@dnd-kit/core';
import type { BlockType } from '../schema/blocks.js';
import { PALETTE } from './palette-items.js';

interface PaletteItemProps {
  type: BlockType;
  label: string;
  icon: string;
}

function PaletteItem({ type, label, icon }: PaletteItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${type}`,
    data: { source: 'palette', blockType: type },
  });

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      className={`flex w-full items-center gap-2 rounded-md border border-secondary-200 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-primary-400 hover:bg-primary-50 ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <span
        aria-hidden
        className="flex h-6 w-6 items-center justify-center rounded bg-secondary-100 text-secondary-600"
      >
        {icon}
      </span>
      <span className="text-secondary-800">{label}</span>
    </button>
  );
}

export function BlockPalette() {
  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-secondary-500">
        Blocks
      </h3>
      <div className="flex flex-col gap-2">
        {PALETTE.map((item) => (
          <PaletteItem key={item.type} {...item} />
        ))}
      </div>
    </div>
  );
}
