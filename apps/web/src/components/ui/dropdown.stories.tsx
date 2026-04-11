import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { Edit, Trash2, Copy, Archive } from 'lucide-react';
import { Dropdown } from './dropdown';

const meta: Meta<typeof Dropdown> = {
  title: 'UI/Dropdown',
  component: Dropdown,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Dropdown>;

export const Default: Story = {
  render: () => {
    const [selected, setSelected] = useState('');
    return (
      <div className="flex flex-col items-start gap-3">
        <Dropdown
          placeholder="Choose action"
          items={[
            { label: 'Edit', value: 'edit' },
            { label: 'Duplicate', value: 'duplicate' },
            { label: 'Archive', value: 'archive' },
            { label: 'Delete', value: 'delete' },
          ]}
          onSelect={setSelected}
        />
        {selected && <p className="text-sm text-secondary-500">Selected: {selected}</p>}
      </div>
    );
  },
};

export const WithIcons: Story = {
  render: () => (
    <Dropdown
      placeholder="Actions"
      items={[
        { label: 'Edit', value: 'edit', icon: <Edit className="h-4 w-4" /> },
        { label: 'Duplicate', value: 'duplicate', icon: <Copy className="h-4 w-4" /> },
        { label: 'Archive', value: 'archive', icon: <Archive className="h-4 w-4" /> },
        { label: 'Delete', value: 'delete', icon: <Trash2 className="h-4 w-4" /> },
      ]}
      onSelect={(v) => alert(`Selected: ${v}`)}
    />
  ),
};

export const WithDisabled: Story = {
  render: () => (
    <Dropdown
      placeholder="Status filter"
      items={[
        { label: 'Active', value: 'active' },
        { label: 'Pending', value: 'pending' },
        { label: 'Bounced', value: 'bounced', disabled: true },
        { label: 'Unsubscribed', value: 'unsubscribed' },
      ]}
      onSelect={() => undefined}
    />
  ),
};
