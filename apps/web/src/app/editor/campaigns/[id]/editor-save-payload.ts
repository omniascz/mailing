/**
 * The body the visual editor PUTs. See
 * app/(dashboard)/campaigns/new/create-payload.ts for why this is a function
 * and not a literal.
 *
 * The comment that used to sit above the literal is kept verbatim below,
 * because it records what went wrong (#66) and why the schema, not its
 * rendered HTML, is what gets stored.
 */

export interface EditorSchema {
  subject?: string;
  preheader?: string;
  [key: string]: unknown;
}

export function buildEditorSavePayload(schema: EditorSchema): Record<string, unknown> {
  return {
    subject: schema.subject,
    preheader: schema.preheader || undefined,
    content: {
      schema,
      // Plain text auto-derived on send (E.10). Leaving unset preserves
      // any plain-text override the user typed in the HTML editor view.
    },
  };
}

/** Every key the visual editor can write. */
export function editorSavePayloadKeys(): string[] {
  return Object.keys(buildEditorSavePayload({ subject: 'x', preheader: 'x' }));
}
