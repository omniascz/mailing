import type { Meta, StoryObj } from '@storybook/nextjs';
import { ToastProvider, useToast } from './toast';
import { Button } from './button';

const meta: Meta = {
  title: 'UI/Toast',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj;

function ToastDemo() {
  const { toast } = useToast();
  return (
    <div className="flex flex-wrap items-center gap-3 p-12">
      <Button onClick={() => toast('success', 'Campaign sent successfully')}>
        Show success
      </Button>
      <Button variant="danger" onClick={() => toast('error', 'Failed to save changes')}>
        Show error
      </Button>
      <Button variant="secondary" onClick={() => toast('warning', 'Your trial ends in 3 days')}>
        Show warning
      </Button>
      <Button variant="ghost" onClick={() => toast('info', 'New feature available')}>
        Show info
      </Button>
    </div>
  );
}

export const AllTypes: Story = {
  render: () => (
    <ToastProvider>
      <ToastDemo />
    </ToastProvider>
  ),
};
