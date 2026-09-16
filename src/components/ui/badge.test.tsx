// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>Paid</Badge>);
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });

  it('applies the success variant class', () => {
    render(<Badge variant="success">Paid</Badge>);
    expect(screen.getByText('Paid').className).toContain('bg-emerald-100');
  });

  it('defaults to the default variant', () => {
    render(<Badge>Draft</Badge>);
    expect(screen.getByText('Draft').className).toContain('bg-cream');
  });
});
