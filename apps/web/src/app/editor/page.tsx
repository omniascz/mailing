'use client';

import { Editor } from '@forgemsg/editor/canvas';

export default function EditorPage() {
  return (
    <Editor
      previewContext={{
        contact: {
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com',
          tags: ['VIP'],
          custom_fields: { plan: 'pro' },
        },
        system: {
          unsubscribeUrl: 'https://forgemsg.example/unsubscribe',
          viewInBrowserUrl: 'https://forgemsg.example/view',
        },
      }}
    />
  );
}
