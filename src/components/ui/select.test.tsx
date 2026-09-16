// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './select';

describe('Select', () => {
  it('reports the selected option on change', async () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="Product" onChange={onChange}>
        <option value="">Select product</option>
        <option value="p1">White Bread Loaf</option>
      </Select>,
    );
    await userEvent.selectOptions(screen.getByLabelText('Product'), 'p1');
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByLabelText('Product')).toHaveValue('p1');
  });
});
