// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DropdownMenu } from './dropdown-menu';

describe('DropdownMenu', () => {
  it('opens on trigger click and shows its content', async () => {
    render(
      <DropdownMenu trigger={<button>Open menu</button>}>
        <button>Log out</button>
      </DropdownMenu>,
    );
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('closes on outside click', async () => {
    render(
      <div>
        <DropdownMenu trigger={<button>Open menu</button>}>
          <button>Log out</button>
        </DropdownMenu>
        <button>Elsewhere</button>
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
    });
  });

  it('closes on Escape', async () => {
    render(
      <DropdownMenu trigger={<button>Open menu</button>}>
        <button>Log out</button>
      </DropdownMenu>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
    });
  });
});
