import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import type { Catalogue } from './domain/catalogue'
import type { Watch } from './domain/types'
import { sampleWatches } from './test/fixtures'
import { resetSessionRepos } from './ui/useSessions'

/** Sample watches with recognisable fake brand names, to prove names stay hidden while voting. */
function testCatalogue(): Catalogue {
  const watches: Watch[] = sampleWatches().map((w, i) => ({
    ...w,
    brand: `Brandname${i}`,
    model: `Model${i}`,
    displayName: `Brandname${i} Model${i}`,
    // Every other photo is a private product photo, whose credit names the brand.
    image:
      i % 2
        ? {
            ...w.image,
            usage: 'personal-use-only' as const,
            source: { ...w.image.source, provider: 'other' as const, author: `Brandname${i} (product photo)`, credit: `Product photo © Brandname${i}` },
          }
        : w.image,
  }))
  return {
    watches,
    opening: {
      men: watches.slice(0, 8).map((w) => [w.id]),
      women: watches.slice(8, 16).map((w) => [w.id]),
    },
    entries: [],
    references: [],
    demo: false,
  }
}

function currentPhoto(): string {
  const img = document.querySelector('.card:not(.ghost) .photo-main') as HTMLImageElement
  return img.getAttribute('src')!
}

async function startSession(name = 'Sam') {
  fireEvent.click(screen.getByRole('button', { name: 'Start' }))
  fireEvent.change(screen.getByPlaceholderText('Your first name (optional)'), { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: 'Show me the first watch' }))
}

const vote = (label: RegExp) => act(() => fireEvent.click(screen.getByRole('button', { name: label })))

beforeEach(() => {
  localStorage.clear()
  resetSessionRepos()
  window.history.replaceState(null, '', '/#/')
})
afterEach(cleanup)

describe('voting', () => {
  it('hides brand and model names while voting', async () => {
    render(<App catalogue={testCatalogue()} />)
    await startSession()
    for (let i = 0; i < 5; i++) {
      expect(document.body.textContent).not.toMatch(/Brandname|Model\d/)
      await vote(/^Yay/)
    }
  })

  it('Undo brings back the previous card and removes its vote', async () => {
    render(<App catalogue={testCatalogue()} />)
    await startSession()
    const first = currentPhoto()
    await vote(/^Yay/)
    expect(currentPhoto()).not.toBe(first)
    await act(() => fireEvent.click(screen.getByRole('button', { name: /Undo/ })))
    expect(currentPhoto()).toBe(first)
    expect(screen.getByText(/Opening round · 1 of 8/)).toBeInTheDocument()
    const stored = JSON.parse(localStorage.getItem('watch-discovery/v1')!)
    expect(stored.sessions[0].votes).toEqual([])
  })

  it('shows a checkpoint after the opening round, then results with names revealed', async () => {
    render(<App catalogue={testCatalogue()} />)
    await startSession('Alex')
    for (let i = 0; i < 8; i++) await vote(i % 2 ? /^Nay/ : /^Yay/)
    expect(screen.getByRole('heading', { name: 'Opening round done' })).toBeInTheDocument()
    expect(screen.getByText('4 Yay')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'See results' }))
    expect(screen.getByRole('heading', { name: /What caught Alex's eye/ })).toBeInTheDocument()
    const favourites = screen.getByRole('heading', { name: 'Favourites' }).parentElement!
    expect(within(favourites).getAllByText(/^Brandname\d+ Model\d+$/)).toHaveLength(4)
    // No percentages anywhere in the results.
    expect(document.body.textContent).not.toMatch(/\d\s?%/)
  })

  it('Pass is shown as neutral and counted separately', async () => {
    render(<App catalogue={testCatalogue()} />)
    await startSession()
    await vote(/^Pass/)
    await vote(/^Pass/)
    await vote(/^Yay/)
    fireEvent.click(screen.getByRole('button', { name: 'Results' }))
    expect(screen.getByText('1 Yay')).toBeInTheDocument()
    expect(screen.getByText('2 Pass')).toBeInTheDocument()
    expect(screen.getByText(/passes don.t count/)).toBeInTheDocument()
  })

  it('supports keyboard shortcuts', async () => {
    render(<App catalogue={testCatalogue()} />)
    await startSession()
    const first = currentPhoto()
    await act(() => fireEvent.keyDown(window, { key: 'ArrowRight' }))
    expect(currentPhoto()).not.toBe(first)
    await act(() => fireEvent.keyDown(window, { key: 'Backspace' }))
    expect(currentPhoto()).toBe(first)
  })
})

describe('home', () => {
  it('explains that no photos are available instead of showing placeholders', () => {
    render(<App catalogue={{ watches: [], opening: { men: [], women: [] }, entries: [], references: [], demo: false }} />)
    expect(screen.getByText(/No verified watch photos yet/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
  })

  it('lists saved sessions after a reload', async () => {
    const catalogue = testCatalogue()
    const { unmount } = render(<App catalogue={catalogue} />)
    await startSession('Robin')
    await vote(/^Yay/)
    unmount()
    resetSessionRepos()
    window.history.replaceState(null, '', '/#/')
    render(<App catalogue={catalogue} />)
    expect(screen.getByText('Robin')).toBeInTheDocument()
    expect(screen.getByText(/1 seen · 1 Yay/)).toBeInTheDocument()
  })
})
