import { describe, it, expect } from 'vitest';
import { scoreToGrade } from '../tabs/overview-tab';

describe('scoreToGrade', () => {
  it('returns A+ for scores >= 93', () => {
    expect(scoreToGrade(100)).toBe('A+');
    expect(scoreToGrade(93)).toBe('A+');
  });

  it('returns A for scores 90-92', () => {
    expect(scoreToGrade(92)).toBe('A');
    expect(scoreToGrade(90)).toBe('A');
  });

  it('returns B for scores 80-89', () => {
    expect(scoreToGrade(89)).toBe('B');
    expect(scoreToGrade(80)).toBe('B');
  });

  it('returns C for scores 70-79', () => {
    expect(scoreToGrade(79)).toBe('C');
    expect(scoreToGrade(70)).toBe('C');
  });

  it('returns D for scores 60-69', () => {
    expect(scoreToGrade(69)).toBe('D');
    expect(scoreToGrade(60)).toBe('D');
  });

  it('returns F for scores below 60', () => {
    expect(scoreToGrade(59)).toBe('F');
    expect(scoreToGrade(0)).toBe('F');
  });
});
