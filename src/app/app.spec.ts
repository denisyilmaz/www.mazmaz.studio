import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });

  it('renders a single accessible heading reading mazmaz', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const visible = Array.from(el.querySelectorAll('h1 > span:not([aria-hidden="true"])'));
    expect(visible.map((s) => s.textContent?.trim()).join('')).toBe('mazmaz');
    expect(el.textContent).toContain('coming soon');
  });
});
