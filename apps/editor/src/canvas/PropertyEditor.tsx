'use client';

import type {
  Block,
  DynamicBlock,
  DynamicRule,
  DynamicRuleOp,
  EmailSchema,
} from '../schema/blocks.js';
import type { BlockPath } from './store.js';

interface PropertyEditorProps {
  email: EmailSchema;
  selectedPath: BlockPath | null;
  selectedBlock: Block | null;
  onUpdateBlock: (path: BlockPath, patch: Record<string, unknown>) => void;
  onUpdateEmail: (patch: Partial<EmailSchema>) => void;
}

/**
 * Right-rail inspector. Renders a block-type specific form so editors can
 * tweak content and styles without touching JSON. When nothing is selected,
 * falls back to the email-level settings (subject, preheader, global styles).
 */
export function PropertyEditor({
  email,
  selectedPath,
  selectedBlock,
  onUpdateBlock,
  onUpdateEmail,
}: PropertyEditorProps) {
  if (!selectedPath || !selectedBlock) {
    return <EmailSettings email={email} onUpdateEmail={onUpdateEmail} />;
  }
  return (
    <div className="flex h-full flex-col gap-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-secondary-500">
        {selectedBlock.type} block
      </h3>
      <BlockForm block={selectedBlock} path={selectedPath} onUpdate={onUpdateBlock} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function EmailSettings({
  email,
  onUpdateEmail,
}: {
  email: EmailSchema;
  onUpdateEmail: (patch: Partial<EmailSchema>) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-secondary-500">
        Email settings
      </h3>
      <Field label="Subject">
        <input
          type="text"
          value={email.subject}
          onChange={(e) => onUpdateEmail({ subject: e.target.value })}
          className={inputCls}
        />
      </Field>
      <Field label="Preheader">
        <input
          type="text"
          value={email.preheader}
          onChange={(e) => onUpdateEmail({ preheader: e.target.value })}
          className={inputCls}
          placeholder="Short preview text shown in the inbox"
        />
      </Field>
      <Field label="Content width">
        <input
          type="number"
          min={320}
          max={800}
          value={email.globalStyles.contentWidth}
          onChange={(e) =>
            onUpdateEmail({
              globalStyles: { ...email.globalStyles, contentWidth: Number(e.target.value) },
            })
          }
          className={inputCls}
        />
      </Field>
      <Field label="Background">
        <input
          type="color"
          value={email.globalStyles.backgroundColor}
          onChange={(e) =>
            onUpdateEmail({
              globalStyles: { ...email.globalStyles, backgroundColor: e.target.value },
            })
          }
          className="h-9 w-full"
        />
      </Field>
      <Field label="Content background">
        <input
          type="color"
          value={email.globalStyles.contentBackgroundColor}
          onChange={(e) =>
            onUpdateEmail({
              globalStyles: { ...email.globalStyles, contentBackgroundColor: e.target.value },
            })
          }
          className="h-9 w-full"
        />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------

function BlockForm({
  block,
  path,
  onUpdate,
}: {
  block: Block;
  path: BlockPath;
  onUpdate: (path: BlockPath, patch: Record<string, unknown>) => void;
}) {
  const update = (patch: Record<string, unknown>) => onUpdate(path, patch);

  switch (block.type) {
    case 'text':
      return (
        <>
          <Field label="Content (HTML)">
            <textarea
              value={block.content}
              onChange={(e) => update({ content: e.target.value })}
              className={`${inputCls} h-32`}
            />
          </Field>
          <Field label="Font size">
            <input
              type="text"
              value={block.fontSize}
              onChange={(e) => update({ fontSize: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Color">
            <input
              type="color"
              value={block.color}
              onChange={(e) => update({ color: e.target.value })}
              className="h-9 w-full"
            />
          </Field>
          <Field label="Align">
            <select
              value={block.textAlign}
              onChange={(e) => update({ textAlign: e.target.value })}
              className={inputCls}
            >
              <option value="left">left</option>
              <option value="center">center</option>
              <option value="right">right</option>
              <option value="justify">justify</option>
            </select>
          </Field>
        </>
      );

    case 'image':
      return (
        <>
          <Field label="Image URL">
            <input
              type="text"
              value={block.src}
              onChange={(e) => update({ src: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Alt text">
            <input
              type="text"
              value={block.alt ?? ''}
              onChange={(e) => update({ alt: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Link (optional)">
            <input
              type="text"
              value={block.link ?? ''}
              onChange={(e) => update({ link: e.target.value || undefined })}
              className={inputCls}
            />
          </Field>
          <Field label="Align">
            <select
              value={block.align}
              onChange={(e) => update({ align: e.target.value })}
              className={inputCls}
            >
              <option value="left">left</option>
              <option value="center">center</option>
              <option value="right">right</option>
            </select>
          </Field>
        </>
      );

    case 'button':
      return (
        <>
          <Field label="Text">
            <input
              type="text"
              value={block.text}
              onChange={(e) => update({ text: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="URL">
            <input
              type="text"
              value={block.url}
              onChange={(e) => update({ url: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Background">
            <input
              type="color"
              value={block.backgroundColor}
              onChange={(e) => update({ backgroundColor: e.target.value })}
              className="h-9 w-full"
            />
          </Field>
          <Field label="Text color">
            <input
              type="color"
              value={block.textColor}
              onChange={(e) => update({ textColor: e.target.value })}
              className="h-9 w-full"
            />
          </Field>
          <Field label="Radius">
            <input
              type="text"
              value={block.borderRadius}
              onChange={(e) => update({ borderRadius: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Size">
            <select
              value={block.size}
              onChange={(e) => update({ size: e.target.value })}
              className={inputCls}
            >
              <option value="sm">Small</option>
              <option value="md">Medium</option>
              <option value="lg">Large</option>
            </select>
          </Field>
          <Field label="Align">
            <select
              value={block.align}
              onChange={(e) => update({ align: e.target.value })}
              className={inputCls}
            >
              <option value="left">left</option>
              <option value="center">center</option>
              <option value="right">right</option>
            </select>
          </Field>
        </>
      );

    case 'divider':
      return (
        <>
          <Field label="Color">
            <input
              type="color"
              value={block.color}
              onChange={(e) => update({ color: e.target.value })}
              className="h-9 w-full"
            />
          </Field>
          <Field label="Thickness (px)">
            <input
              type="number"
              min={1}
              max={20}
              value={block.thickness}
              onChange={(e) => update({ thickness: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
          <Field label="Width (%)">
            <input
              type="number"
              min={1}
              max={100}
              value={block.widthPercent}
              onChange={(e) => update({ widthPercent: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
        </>
      );

    case 'spacer':
      return (
        <Field label="Height (px)">
          <input
            type="number"
            min={1}
            max={500}
            value={block.height}
            onChange={(e) => update({ height: Number(e.target.value) })}
            className={inputCls}
          />
        </Field>
      );

    case 'footer':
      return (
        <>
          <Field label="Content">
            <textarea
              value={block.content}
              onChange={(e) => update({ content: e.target.value })}
              className={`${inputCls} h-24`}
            />
          </Field>
          <Field label="Show unsubscribe link">
            <input
              type="checkbox"
              checked={block.showUnsubscribe}
              onChange={(e) => update({ showUnsubscribe: e.target.checked })}
            />
          </Field>
          <Field label="Font size">
            <input
              type="text"
              value={block.fontSize}
              onChange={(e) => update({ fontSize: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Color">
            <input
              type="color"
              value={block.color}
              onChange={(e) => update({ color: e.target.value })}
              className="h-9 w-full"
            />
          </Field>
        </>
      );

    case 'social':
      return (
        <>
          <Field label="Icon size (px)">
            <input
              type="number"
              min={16}
              max={64}
              value={block.iconSize}
              onChange={(e) => update({ iconSize: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
          <Field label="Align">
            <select
              value={block.align}
              onChange={(e) => update({ align: e.target.value })}
              className={inputCls}
            >
              <option value="left">left</option>
              <option value="center">center</option>
              <option value="right">right</option>
            </select>
          </Field>
          <div className="text-xs text-secondary-500">Networks: edit via JSON for now.</div>
        </>
      );

    case 'columns':
      return (
        <Field label="Column ratios (comma-separated)">
          <input
            type="text"
            value={block.columnRatios.join(',')}
            onChange={(e) => {
              const ratios = e.target.value
                .split(',')
                .map((s) => Number(s.trim()))
                .filter((n) => Number.isFinite(n) && n > 0);
              if (ratios.length === block.columns.length) update({ columnRatios: ratios });
            }}
            className={inputCls}
          />
        </Field>
      );

    case 'hero':
      return (
        <>
          <Field label="Background color">
            <input
              type="color"
              value={block.backgroundColor ?? '#111827'}
              onChange={(e) => update({ backgroundColor: e.target.value })}
              className="h-9 w-full"
            />
          </Field>
          <Field label="Background image URL">
            <input
              type="text"
              value={block.backgroundImage ?? ''}
              onChange={(e) => update({ backgroundImage: e.target.value || undefined })}
              className={inputCls}
            />
          </Field>
          <Field label="Min height">
            <input
              type="text"
              value={block.minHeight ?? '240px'}
              onChange={(e) => update({ minHeight: e.target.value })}
              className={inputCls}
            />
          </Field>
        </>
      );

    case 'dynamic':
      return <DynamicEditor block={block} onUpdate={update} />;
  }
}

// ---------------------------------------------------------------------------

function DynamicEditor({
  block,
  onUpdate,
}: {
  block: DynamicBlock;
  onUpdate: (patch: Record<string, unknown>) => void;
}) {
  const { condition } = block;
  const updateRule = (idx: number, patch: Partial<DynamicRule>) => {
    const nextRules = condition.rules.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onUpdate({ condition: { ...condition, rules: nextRules } });
  };
  const addRule = () =>
    onUpdate({
      condition: {
        ...condition,
        rules: [...condition.rules, { field: 'tags', op: 'has_tag', value: '' }],
      },
    });
  const removeRule = (idx: number) =>
    onUpdate({
      condition: { ...condition, rules: condition.rules.filter((_, i) => i !== idx) },
    });

  return (
    <>
      <Field label="Label">
        <input
          type="text"
          value={block.label ?? ''}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className={inputCls}
        />
      </Field>
      <Field label="Operator">
        <select
          value={condition.operator}
          onChange={(e) =>
            onUpdate({ condition: { ...condition, operator: e.target.value as 'AND' | 'OR' } })
          }
          className={inputCls}
        >
          <option value="AND">AND (all rules)</option>
          <option value="OR">OR (any rule)</option>
        </select>
      </Field>

      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-secondary-500">
          Rules
        </div>
        {condition.rules.map((rule, i) => (
          <div key={i} className="flex flex-col gap-1 rounded border border-secondary-200 p-2">
            <input
              type="text"
              value={rule.field}
              onChange={(e) => updateRule(i, { field: e.target.value })}
              placeholder="field (e.g. tags, custom.plan)"
              className={inputCls}
            />
            <select
              value={rule.op}
              onChange={(e) => updateRule(i, { op: e.target.value as DynamicRuleOp })}
              className={inputCls}
            >
              {(
                [
                  'eq',
                  'neq',
                  'gt',
                  'gte',
                  'lt',
                  'lte',
                  'contains',
                  'not_contains',
                  'in',
                  'not_in',
                  'is_set',
                  'is_not_set',
                  'has_tag',
                  'not_has_tag',
                ] as const
              ).map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={String(rule.value ?? '')}
              onChange={(e) => updateRule(i, { value: e.target.value })}
              placeholder="value"
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => removeRule(i)}
              className="self-end text-xs text-danger-600 hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRule}
          className="rounded border border-dashed border-secondary-300 px-2 py-1 text-xs text-secondary-600 hover:border-primary-400 hover:text-primary-600"
        >
          + Add rule
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

const inputCls =
  'w-full rounded border border-secondary-200 bg-white px-2 py-1 text-sm focus:border-primary-400 focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-secondary-600">{label}</span>
      {children}
    </label>
  );
}
