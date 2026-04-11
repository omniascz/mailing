import type { Meta, StoryObj } from '@storybook/nextjs';
import { Badge } from './badge';

const meta: Meta<typeof Badge> = {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'primary', 'success', 'warning', 'danger', 'accent'],
    },
  },
  args: {
    children: 'Active',
    variant: 'default',
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>Default</Badge>
      <Badge variant="primary">Primary</Badge>
      <Badge variant="success">Active</Badge>
      <Badge variant="warning">Pending</Badge>
      <Badge variant="danger">Failed</Badge>
      <Badge variant="accent">VIP</Badge>
    </div>
  ),
};

export const ContactStatus: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="w-32 text-sm">alice@example.com</span>
        <Badge variant="success">Subscribed</Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-32 text-sm">bob@example.com</span>
        <Badge variant="warning">Pending</Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-32 text-sm">eve@example.com</span>
        <Badge variant="danger">Bounced</Badge>
      </div>
    </div>
  ),
};
