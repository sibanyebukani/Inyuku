// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardTitle, CardContent } from './card';

describe('Card', () => {
  it('composes header, title, and content', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Shop settings</CardTitle>
        </CardHeader>
        <CardContent>Body text</CardContent>
      </Card>,
    );
    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Shop settings' })).toBeInTheDocument();
    expect(screen.getByText('Body text')).toBeInTheDocument();
  });

  it('merges a caller className onto Card', () => {
    render(<Card className="mt-4" data-testid="card">x</Card>);
    expect(screen.getByTestId('card').className).toContain('mt-4');
  });
});
