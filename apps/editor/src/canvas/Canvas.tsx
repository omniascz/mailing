'use client';

import { useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Block, EmailSchema } from '../schema/blocks.js';
import type { BlockPath, PathKey } from './store.js';

interface CanvasProps {
  email: EmailSchema;
  selectedPath: BlockPath | null;
  onSelect: (path: BlockPath | null) => void;
  onRemove: (path: BlockPath) => void;
}

/**
 * Visual rendering of the email tree. Each block is both:
 *  - a droppable (so palette items and existing blocks can drop into it), and
 *  - a draggable (so it can be reordered).
 */
export function Canvas({ email, selectedPath, onSelect, onRemove }: CanvasProps) {
  return (
    <div
      className="mx-auto my-6"
      style={{
        width: `${email.globalStyles.contentWidth}px`,
        backgroundColor: email.globalStyles.contentBackgroundColor,
        fontFamily: email.globalStyles.fontFamily,
        color: email.globalStyles.textColor,
        minHeight: '400px',
      }}
      onClick={() => onSelect(null)}
    >
      <DropZone parentPath={[]} parentKey="root" index={0} />
      {email.blocks.map((block, i) => {
        const path: BlockPath = [['root', i]];
        return (
          <div key={block.id}>
            <DraggableBlock
              block={block}
              path={path}
              isSelected={samePath(selectedPath, path)}
              onSelect={onSelect}
              onRemove={onRemove}
              selectedPath={selectedPath}
            />
            <DropZone parentPath={[]} parentKey="root" index={i + 1} />
          </div>
        );
      })}
      {email.blocks.length === 0 && (
        <div className="flex h-48 items-center justify-center text-secondary-400">
          Drag blocks here to get started
        </div>
      )}
    </div>
  );
}

function samePath(a: BlockPath | null, b: BlockPath): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every(([k, i], idx) => b[idx]?.[0] === k && b[idx]?.[1] === i);
}

// ---------------------------------------------------------------------------

interface DropZoneProps {
  parentPath: BlockPath;
  parentKey: PathKey;
  index: number;
}

function DropZone({ parentPath, parentKey, index }: DropZoneProps) {
  const id = `drop:${parentKey}:${parentPath.map(([, i]) => i).join('.')}:${index}`;
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: { target: 'dropzone', parentPath, parentKey, index },
  });
  return (
    <div
      ref={setNodeRef}
      className={`my-0.5 h-2 rounded transition-colors ${isOver ? 'bg-primary-400' : 'bg-transparent'}`}
    />
  );
}

// ---------------------------------------------------------------------------

interface DraggableBlockProps {
  block: Block;
  path: BlockPath;
  isSelected: boolean;
  selectedPath: BlockPath | null;
  onSelect: (path: BlockPath | null) => void;
  onRemove: (path: BlockPath) => void;
}

function DraggableBlock({
  block,
  path,
  isSelected,
  selectedPath,
  onSelect,
  onRemove,
}: DraggableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `block:${block.id}`,
    data: { source: 'block', path },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative border-2 ${isSelected ? 'border-primary-500' : 'border-transparent hover:border-primary-200'}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(path);
      }}
    >
      <div
        {...listeners}
        {...attributes}
        className="absolute left-0 top-0 z-10 cursor-grab bg-primary-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white opacity-0 group-hover:opacity-100"
      >
        {block.type}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(path);
        }}
        className="absolute right-0 top-0 z-10 bg-danger-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white opacity-0 group-hover:opacity-100"
      >
        ×
      </button>
      <BlockBody
        block={block}
        path={path}
        selectedPath={selectedPath}
        onSelect={onSelect}
        onRemove={onRemove}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

interface BlockBodyProps {
  block: Block;
  path: BlockPath;
  selectedPath: BlockPath | null;
  onSelect: (path: BlockPath | null) => void;
  onRemove: (path: BlockPath) => void;
}

function BlockBody({ block, path, selectedPath, onSelect, onRemove }: BlockBodyProps) {
  const padding = block.styles?.padding ?? '16px 24px';
  const bg = block.styles?.backgroundColor;

  switch (block.type) {
    case 'text':
      return (
        <div
          style={{
            padding,
            backgroundColor: bg,
            fontSize: block.fontSize,
            color: block.color,
            lineHeight: block.lineHeight,
            textAlign: block.textAlign,
          }}
          dangerouslySetInnerHTML={{ __html: block.content }}
        />
      );

    case 'image':
      return (
        <div style={{ padding, textAlign: block.align, backgroundColor: bg }}>
          <img
            src={block.src}
            alt={block.alt}
            style={{ maxWidth: '100%', display: 'inline-block' }}
          />
        </div>
      );

    case 'button':
      return (
        <div style={{ padding, textAlign: block.align, backgroundColor: bg }}>
          <span
            style={{
              display: 'inline-block',
              padding:
                block.size === 'sm' ? '8px 16px' : block.size === 'lg' ? '16px 32px' : '12px 24px',
              backgroundColor: block.backgroundColor,
              color: block.textColor,
              borderRadius: block.borderRadius,
              fontWeight: 600,
            }}
          >
            {block.text}
          </span>
        </div>
      );

    case 'divider':
      return (
        <div style={{ padding, backgroundColor: bg }}>
          <hr
            style={{
              border: 0,
              borderTop: `${block.thickness}px solid ${block.color}`,
              width: `${block.widthPercent}%`,
              margin: '0 auto',
            }}
          />
        </div>
      );

    case 'spacer':
      return <div style={{ height: block.height, backgroundColor: bg }} />;

    case 'social':
      return (
        <div style={{ padding, textAlign: block.align, backgroundColor: bg }}>
          {block.networks.map((n, i) => (
            <span
              key={`${n.type}-${i}`}
              style={{
                display: 'inline-block',
                width: block.iconSize,
                height: block.iconSize,
                lineHeight: `${block.iconSize}px`,
                textAlign: 'center',
                borderRadius: Math.floor(block.iconSize / 2),
                background: '#111827',
                color: '#fff',
                margin: '0 4px',
                fontSize: Math.max(10, Math.floor(block.iconSize / 3)),
                fontWeight: 600,
              }}
            >
              {n.type.charAt(0).toUpperCase()}
            </span>
          ))}
        </div>
      );

    case 'footer':
      return (
        <div
          style={{
            padding,
            backgroundColor: bg,
            fontSize: block.fontSize,
            color: block.color,
            textAlign: block.textAlign,
          }}
        >
          {block.content}
          {block.showUnsubscribe && (
            <div style={{ marginTop: 8 }}>
              <a href="#" style={{ color: block.color, textDecoration: 'underline' }}>
                Unsubscribe
              </a>
            </div>
          )}
        </div>
      );

    case 'columns':
      return (
        <div style={{ padding, backgroundColor: bg, display: 'flex', gap: block.gap ?? '0' }}>
          {block.columns.map((col, colIdx) => (
            <div
              key={colIdx}
              style={{ flex: block.columnRatios[colIdx] ?? 1, minWidth: 0 }}
              className="border border-dashed border-secondary-200"
            >
              {col.map((child, childIdx) => {
                const childPath: BlockPath = [...path, [`col:${colIdx}`, childIdx]];
                return (
                  <DraggableBlock
                    key={child.id}
                    block={child}
                    path={childPath}
                    isSelected={samePath(selectedPath, childPath)}
                    selectedPath={selectedPath}
                    onSelect={onSelect}
                    onRemove={onRemove}
                  />
                );
              })}
              <DropZone parentPath={path} parentKey={`col:${colIdx}`} index={col.length} />
            </div>
          ))}
        </div>
      );

    case 'hero':
      return (
        <div
          style={{
            padding,
            backgroundColor: block.backgroundColor,
            backgroundImage: block.backgroundImage ? `url(${block.backgroundImage})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            minHeight: block.minHeight,
            color: '#fff',
          }}
        >
          {block.content.map((child, i) => {
            const childPath: BlockPath = [...path, ['hero', i]];
            return (
              <DraggableBlock
                key={child.id}
                block={child}
                path={childPath}
                isSelected={samePath(selectedPath, childPath)}
                selectedPath={selectedPath}
                onSelect={onSelect}
                onRemove={onRemove}
              />
            );
          })}
          <DropZone parentPath={path} parentKey="hero" index={block.content.length} />
        </div>
      );

    case 'dynamic':
      return (
        <div style={{ padding, backgroundColor: bg }}>
          <div className="mb-2 rounded border-2 border-dashed border-success-500 p-2">
            <div className="mb-1 text-[10px] font-semibold uppercase text-success-700">
              IF {block.label ?? 'condition matches'}
            </div>
            {block.ifContent.map((child, i) => {
              const childPath: BlockPath = [...path, ['if', i]];
              return (
                <DraggableBlock
                  key={child.id}
                  block={child}
                  path={childPath}
                  isSelected={samePath(selectedPath, childPath)}
                  selectedPath={selectedPath}
                  onSelect={onSelect}
                  onRemove={onRemove}
                />
              );
            })}
            <DropZone parentPath={path} parentKey="if" index={block.ifContent.length} />
          </div>
          <div className="rounded border-2 border-dashed border-warning-500 p-2">
            <div className="mb-1 text-[10px] font-semibold uppercase text-warning-700">ELSE</div>
            {block.elseContent.map((child, i) => {
              const childPath: BlockPath = [...path, ['else', i]];
              return (
                <DraggableBlock
                  key={child.id}
                  block={child}
                  path={childPath}
                  isSelected={samePath(selectedPath, childPath)}
                  selectedPath={selectedPath}
                  onSelect={onSelect}
                  onRemove={onRemove}
                />
              );
            })}
            <DropZone parentPath={path} parentKey="else" index={block.elseContent.length} />
          </div>
        </div>
      );
  }
}
