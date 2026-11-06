import { TreeBudget } from './tree-budget.js';

const limits = { policy: 1, members: 3, bytes: 100, memberBytes: 40, depth: 2 };

describe('TreeBudget', () => {
  it("gives a member the bytes left, at most one member's", () => {
    const budget = new TreeBudget(1000, limits);

    expect(budget.list(null)).toBe(40);
    budget.spent(70);
    expect(budget.list(10)).toBe(30);
  });

  it("takes storage's limit for a member when that's less", () => {
    expect(new TreeBudget(25, limits).list(null)).toBe(25);
  });

  it('leaves out unread a member declared past its limits', () => {
    const budget = new TreeBudget(1000, limits);

    expect(budget.list(41)).toBe('TOO_LARGE');
    budget.spent(80);
    expect(budget.list(21)).toBe('OVER_BUDGET');
    budget.spent(20);
    expect(budget.list(null)).toBe('OVER_BUDGET');
  });

  it('says why a member that came out past what it was given is left out', () => {
    const budget = new TreeBudget(1000, limits);

    expect(budget.past(40)).toBe('TOO_LARGE');
    expect(budget.past(30)).toBe('OVER_BUDGET');
  });

  it('is full once as many members are listed as it allows', () => {
    const budget = new TreeBudget(1000, limits);
    budget.list(41);
    budget.list(null);
    expect(budget.full).toBe(false);

    budget.list(null);

    expect(budget.full).toBe(true);
  });

  it('opens containers above its depth', () => {
    const budget = new TreeBudget(1000, limits);

    expect(budget.opens(1)).toBe(true);
    expect(budget.opens(2)).toBe(false);
  });
});
