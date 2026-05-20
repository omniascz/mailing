import type { Meta, StoryObj } from '@storybook/nextjs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';
import { Button } from './button';

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Campaign report</CardTitle>
        <CardDescription>Weekly newsletter performance</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-secondary-500">Sent</span>
            <span className="font-medium">12,453</span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary-500">Opens</span>
            <span className="font-medium">3,021 (24.3%)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary-500">Clicks</span>
            <span className="font-medium">418 (3.4%)</span>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="secondary" size="sm">
          View details
        </Button>
        <Button size="sm">Send again</Button>
      </CardFooter>
    </Card>
  ),
};

export const Simple: Story = {
  render: () => (
    <Card>
      <p className="text-sm text-secondary-700">A minimal card with just content.</p>
    </Card>
  ),
};

export const WithoutFooter: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Quick stats</CardTitle>
        <CardDescription>Last 30 days</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold text-primary-600">94.2%</p>
        <p className="text-sm text-secondary-500">Average delivery rate</p>
      </CardContent>
    </Card>
  ),
};
