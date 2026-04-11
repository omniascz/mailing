import type { Meta, StoryObj } from '@storybook/nextjs';
import { Input } from './input';

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  decorators: [(Story) => <div className="w-80"><Story /></div>],
  args: {
    label: 'Email',
    placeholder: 'you@company.com',
    type: 'email',
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {};

export const WithHelperText: Story = {
  args: {
    helperText: 'We will never share your email.',
  },
};

export const WithError: Story = {
  args: {
    error: 'Email is required',
    value: '',
  },
};

export const Password: Story = {
  args: {
    label: 'Password',
    type: 'password',
    placeholder: 'At least 8 characters',
    autoComplete: 'new-password',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    value: 'disabled@example.com',
  },
};

export const WithValue: Story = {
  args: {
    value: 'alice@forgemsg.com',
  },
};

export const FormExample: Story = {
  render: () => (
    <form className="space-y-4">
      <Input label="Full name" placeholder="John Doe" />
      <Input label="Email" type="email" placeholder="you@company.com" />
      <Input label="Password" type="password" helperText="At least 8 characters" />
    </form>
  ),
};
