// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet } from './sheet';

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(
      <Sheet open={false} onClose={vi.fn()}>
        <p>Menu content</p>
      </Sheet>,
    );
    expect(screen.queryByText('Menu content')).not.toBeInTheDocument();
  });

  it('renders its content when open', () => {
    render(
      <Sheet open onClose={vi.fn()}>
        <p>Menu content</p>
      </Sheet>,
    );
    expect(screen.getByText('Menu content')).toBeInTheDocument();
  });

  it('calls onClose when the backdrop is clicked', async () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose}>
        <p>Menu content</p>
      </Sheet>,
    );
    await userEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose}>
        <p>Menu content</p>
      </Sheet>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
