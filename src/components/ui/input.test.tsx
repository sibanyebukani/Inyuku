// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './input';

describe('Input', () => {
  it('accepts typed input and reports changes', async () => {
    const onChange = vi.fn();
    render(<Input aria-label="Email" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByLabelText('Email')).toHaveValue('a@b.com');
  });

  it('forwards a ref to the underlying input element', () => {
    let node: HTMLInputElement | null = null;
    render(
      <Input
        aria-label="Email"
        ref={(el) => {
          node = el;
        }}
      />,
    );
    expect(node).toBeInstanceOf(HTMLInputElement);
  });
});
