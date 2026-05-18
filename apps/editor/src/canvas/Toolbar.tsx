'use client';

interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  previewMode: 'desktop' | 'mobile';
  onTogglePreview: () => void;
  previewAllDynamic: boolean;
  onToggleDynamicPreview: () => void;
  onExportHtml?: () => void;
  onExportJson?: () => void;
}

export function Toolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  previewMode,
  onTogglePreview,
  previewAllDynamic,
  onToggleDynamicPreview,
  onExportHtml,
  onExportJson,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-secondary-200 bg-white px-4 py-2">
      <ToolbarButton onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        ↶ Undo
      </ToolbarButton>
      <ToolbarButton onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
        ↷ Redo
      </ToolbarButton>
      <div className="mx-2 h-5 w-px bg-secondary-200" />
      <ToolbarButton onClick={onTogglePreview} title="Toggle desktop/mobile preview">
        {previewMode === 'desktop' ? '💻 Desktop' : '📱 Mobile'}
      </ToolbarButton>
      <ToolbarButton
        onClick={onToggleDynamicPreview}
        title="Show both branches of dynamic blocks"
        active={previewAllDynamic}
      >
        ⟨⟩ All branches
      </ToolbarButton>
      <div className="flex-1" />
      {onExportJson && (
        <ToolbarButton onClick={onExportJson} title="Export JSON">
          Export JSON
        </ToolbarButton>
      )}
      {onExportHtml && (
        <ToolbarButton onClick={onExportHtml} title="Export HTML">
          Export HTML
        </ToolbarButton>
      )}
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
        disabled
          ? 'cursor-not-allowed border-secondary-100 text-secondary-300'
          : active
            ? 'border-primary-500 bg-primary-50 text-primary-700'
            : 'border-secondary-200 bg-white text-secondary-700 hover:border-primary-400 hover:text-primary-700'
      }`}
    >
      {children}
    </button>
  );
}
