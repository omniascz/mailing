import type { Meta, StoryObj } from '@storybook/nextjs';
import { Avatar } from './avatar';

const meta: Meta<typeof Avatar> = {
  title: 'UI/Avatar',
  component: Avatar,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
  },
  args: {
    name: 'Alice Johnson',
    size: 'md',
  },
};

export default meta;
type Story = StoryObj<typeof Avatar>;

export const Initials: Story = {};

export const Image: Story = {
  args: {
    src: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Alice',
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      <Avatar name="Alice Johnson" size="sm" />
      <Avatar name="Bob Smith" size="md" />
      <Avatar name="Charlie Brown" size="lg" />
    </div>
  ),
};

export const HashColors: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {['Alice Johnson', 'Bob Smith', 'Charlie Brown', 'Diana Prince', 'Evan King'].map((name) => (
        <div key={name} className="flex flex-col items-center gap-1">
          <Avatar name={name} />
          <span className="text-xs text-secondary-500">{name.split(' ')[0]}</span>
        </div>
      ))}
    </div>
  ),
};

export const TeamRow: Story = {
  render: () => (
    <div className="flex -space-x-2">
      <Avatar name="Alice Johnson" className="ring-2 ring-white" />
      <Avatar name="Bob Smith" className="ring-2 ring-white" />
      <Avatar name="Charlie Brown" className="ring-2 ring-white" />
      <Avatar name="Diana Prince" className="ring-2 ring-white" />
      <div className="z-10 flex h-10 w-10 items-center justify-center rounded-full bg-secondary-200 text-xs font-medium ring-2 ring-white">
        +3
      </div>
    </div>
  ),
};
