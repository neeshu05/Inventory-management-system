import '@testing-library/jest-dom'
import { vi } from 'vitest'

// react-hot-toast calls window.matchMedia — jsdom doesn't implement it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// The axios interceptor does `window.location.href = '/login'` on session expiry.
// jsdom throws "Not implemented: navigation" for that, so we replace location with
// a plain object where href/pathname are writable strings.
delete window.location
window.location = {
  href: 'http://localhost/login',
  pathname: '/login',   // makes the "don't redirect if already on /login" guard work
  assign: vi.fn(),
  replace: vi.fn(),
  reload: vi.fn(),
}
