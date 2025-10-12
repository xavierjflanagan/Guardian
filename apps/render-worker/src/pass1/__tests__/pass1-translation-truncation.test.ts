/**
 * Unit tests for truncateTextField function
 * Phase 5 Optimization 2: Server-side truncation enforcement
 */

import { truncateTextField } from '../pass1-translation';

describe('truncateTextField', () => {
  test('returns null for null input', () => {
    expect(truncateTextField(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(truncateTextField(undefined as any)).toBeNull();
  });

  test('returns original text if under limit', () => {
    const text = 'short text';
    expect(truncateTextField(text, 120)).toBe('short text');
  });

  test('returns original text if exactly at limit', () => {
    const exactText = 'a'.repeat(120);
    expect(truncateTextField(exactText, 120)).toBe(exactText);
    expect(truncateTextField(exactText, 120)).toHaveLength(120);
  });

  test('truncates text over limit with ellipsis', () => {
    const longText = 'a'.repeat(150);
    const truncated = truncateTextField(longText, 120);

    expect(truncated).toHaveLength(120);
    expect(truncated).toMatch(/\.\.\.$/);
    expect(truncated).toBe('a'.repeat(117) + '...');
  });

  test('handles empty string', () => {
    expect(truncateTextField('', 120)).toBe('');
  });

  test('respects custom maxLength parameter', () => {
    const text = 'a'.repeat(100);
    const truncated = truncateTextField(text, 50);

    expect(truncated).toHaveLength(50);
    expect(truncated).toMatch(/\.\.\.$/);
    expect(truncated).toBe('a'.repeat(47) + '...');
  });

  test('truncates at boundary with meaningful text', () => {
    const text = 'This is a very long text that exceeds the character limit and needs to be truncated to fit within database constraints for the ai_visual_interpretation field';
    const truncated = truncateTextField(text, 120);

    expect(truncated).toHaveLength(120);
    expect(truncated).toMatch(/\.\.\.$/);
    expect(truncated).toContain('This is a very long text');
  });

  test('uses default maxLength of 120 when not specified', () => {
    const text = 'a'.repeat(150);
    const truncated = truncateTextField(text);

    expect(truncated).toHaveLength(120);
    expect(truncated).toMatch(/\.\.\.$/);
  });

  test('handles text with special characters', () => {
    const text = 'Test with accented and special characters: é, ñ, ç, ü. ' + 'a'.repeat(100);
    const truncated = truncateTextField(text, 120);

    expect(truncated).toHaveLength(120);
    expect(truncated).toMatch(/\.\.\.$/);
  });
});
