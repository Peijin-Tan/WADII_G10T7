import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import Pantry from '@/views/Pantry.vue'
import {
  server, httpError, renderPage, text, button, label, answerDialog, confirmState, flushPromises, pantryItem,
} from './mealFlowSupport'

vi.mock('axios', async () => (await import('./fakeServer')).axiosModule)
enableAutoUnmount(afterEach)

const TODAY = new Date(2026, 10, 4, 10, 0, 0)

const expiryIn = (n) => new Date(2026, 10, 4 + n, 12).toISOString()

const SuggestionModal = {
  name: 'SuggestionModal',
  props: ['recipes', 'loading', 'error', 'message', 'pantryCount'],
  emits: ['search', 'close'],
  template: '<div data-testid="suggestions-stub">{{ pantryCount }} in stock, {{ recipes.length }} recipes</div>',
}

const eggs = pantryItem({ _id: 'p1', name: 'Eggs', quantity: 6, unit: 'pcs', category: 'dairy', expiryDate: expiryIn(10) })
const milk = pantryItem({ _id: 'p2', name: 'Milk', quantity: 1, unit: 'l', category: 'dairy', expiryDate: expiryIn(2) })
const rice = pantryItem({ _id: 'p3', name: 'Basmati rice', quantity: 2, unit: 'kg', category: 'grains', expiryDate: null })
const startingPantry = () => ({ items: [eggs, milk, rice].map((i) => ({ ...i })) })

const renderPantry = () => renderPage(Pantry, { path: '/pantry', stubs: { SuggestionModal, suggestionsModal: SuggestionModal } })
const rows = (wrapper) => wrapper.findAll('[data-testid="pantry-item"]')
const rowNames = (wrapper) => rows(wrapper).map((r) => r.get('[role="group"]').attributes('aria-label').replace('Quantity of ', ''))
const rowFor = (wrapper, name) => rows(wrapper).find((r) => label(r).startsWith(name))
const tile = (wrapper, name) => wrapper.findAll('.fft-tile').find((t) => label(t).startsWith(name))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  server.reset()
  server.on('GET /pantry', startingPantry)
})
afterEach(() => {
  vi.useRealTimers()
  if (confirmState.open) answerDialog(false)
})

describe('Pantry: showing what is at home', () => {
  it('PA01 lists items by category (in a fixed order), A to Z inside each one', async () => {
    const { wrapper } = await renderPantry()

    const groupTitles = wrapper.findAll('h3').map((h) => h.text()).filter((t) => t !== 'Your pantry is empty')
    expect(groupTitles).toEqual(['Dairy & Eggs', 'Grains & Bread'])
    expect(rowNames(wrapper)).toEqual(['Eggs', 'Milk', 'Basmati rice'])
    expect(text(wrapper)).toContain('3 items')
    expect(label(tile(wrapper, 'Categories'))).toBe('Categories 2')
    expect(wrapper.get('[data-testid="pantry-item-qty"]').text()).toBe('6 pcs')
  })

  it('PA02 an empty pantry says so, and "What can I cook?" is switched off', async () => {
    server.on('GET /pantry', () => ({ items: [] }))
    const { wrapper } = await renderPantry()

    expect(wrapper.get('[data-testid="pantry-empty"]').text()).toContain('Your pantry is empty')
    expect(wrapper.get('[data-testid="go-suggestions"]').attributes('disabled')).toBeDefined()
  })

  it('PA03 use-by labels warn about food that is expiring or used up', async () => {
    server.on('GET /pantry', () => ({
      items: [
        pantryItem({ _id: 'a', name: 'Bread', category: 'grains', expiryDate: expiryIn(-1) }),
        pantryItem({ _id: 'b', name: 'Chicken', category: 'meat', expiryDate: expiryIn(0) }),
        pantryItem({ _id: 'c', name: 'Spinach', category: 'produce', expiryDate: expiryIn(3) }),
        pantryItem({ _id: 'd', name: 'Butter', category: 'dairy', expiryDate: expiryIn(20) }),
        pantryItem({ _id: 'e', name: 'Tofu', category: 'produce', quantity: 0, expiryDate: expiryIn(1) }),
      ],
    }))
    const { wrapper } = await renderPantry()

    expect(label(rowFor(wrapper, 'Bread'))).toContain('Expired')
    expect(label(rowFor(wrapper, 'Chicken'))).toContain('Expires today')
    expect(label(rowFor(wrapper, 'Spinach'))).toContain('3d left')
    expect(label(rowFor(wrapper, 'Butter'))).toContain('20d left')
    expect(label(rowFor(wrapper, 'Tofu'))).toContain('Used up')
    expect(label(tile(wrapper, 'Use Within 3 Days'))).toBe('Use Within 3 Days 3')
  })
})

describe('Pantry: finding items', () => {
  it('PA04 the "Use within 3 days" tile shows only those items, and a second click shows all again', async () => {
    const { wrapper } = await renderPantry()
    const useSoon = tile(wrapper, 'Use Within 3 Days')

    await useSoon.trigger('click')
    expect(rowNames(wrapper)).toEqual(['Milk'])
    expect(useSoon.attributes('aria-pressed')).toBe('true')

    await useSoon.trigger('click')
    expect(rowNames(wrapper)).toHaveLength(3)
  })

  it('PA05 search matches part of a name, ignoring case, and says when nothing matches', async () => {
    const { wrapper } = await renderPantry()
    const search = wrapper.get('input[aria-label="Search your pantry"]')

    await search.setValue('RICE')
    expect(rowNames(wrapper)).toEqual(['Basmati rice'])

    await search.setValue('saffron')
    expect(rows(wrapper)).toHaveLength(0)
    expect(text(wrapper)).toContain('Nothing matches. Try another search or filter.')
  })

  it('PA06 category chips show one category at a time', async () => {
    const { wrapper } = await renderPantry()
    const chips = wrapper.get('[aria-label="Filter by category"]')

    await button(chips, 'Grains & Bread').trigger('click')
    expect(rowNames(wrapper)).toEqual(['Basmati rice'])
    await button(chips, 'All').trigger('click')
    expect(rowNames(wrapper)).toHaveLength(3)
  })
})

describe('Pantry: adding, changing and removing', () => {
  it('PA07 adding a new ingredient sends the form and confirms it', async () => {
    server.on('POST /pantry', ({ body }) => ({ items: [...startingPantry().items, pantryItem({ _id: 'p9', ...body })] }))
    const { wrapper } = await renderPantry()

    await wrapper.get('[data-testid="pantry-name"]').setValue('  Garlic ')
    await wrapper.get('[data-testid="pantry-qty"]').setValue(3)
    await wrapper.get('#ing-cat').setValue('produce')
    await wrapper.get('[data-testid="pantry-form"]').trigger('submit')
    await flushPromises()

    expect(server.last('POST /pantry').body).toEqual({ name: 'Garlic', quantity: 3, unit: 'pcs', category: 'produce' })
    expect(wrapper.get('[data-testid="pantry-notice"]').text()).toContain('Added Garlic')
    expect(rowNames(wrapper)).toContain('Garlic')
    expect(wrapper.get('[data-testid="pantry-name"]').element.value).toBe('')
  })

  it('PA08 adding something already in the pantry tells the user the new total', async () => {
    server.on('POST /pantry', () => ({ items: startingPantry().items.map((i) => (i._id === 'p1' ? { ...i, quantity: 12 } : i)) }))
    const { wrapper } = await renderPantry()

    await wrapper.get('[data-testid="pantry-name"]').setValue('eggs')
    await wrapper.get('[data-testid="pantry-qty"]').setValue(6)
    await wrapper.get('[data-testid="pantry-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="pantry-notice"]').text()).toContain('Eggs now 12 pcs')
  })

  it('PA09 the + and - buttons step by a sensible amount for the unit', async () => {
    server.on('PATCH /pantry/p1', ({ body }) => ({ items: startingPantry().items.map((i) => (i._id === 'p1' ? { ...i, ...body } : i)) }))
    server.on('PATCH /pantry/p3', ({ body }) => ({ items: startingPantry().items.map((i) => (i._id === 'p3' ? { ...i, ...body } : i)) }))
    const { wrapper } = await renderPantry()

    await button(wrapper, 'Less Eggs').trigger('click')
    await flushPromises()
    expect(server.last('PATCH /pantry/p1').body).toEqual({ quantity: 5 })
    expect(rowFor(wrapper, 'Eggs').get('[data-testid="pantry-item-qty"]').text()).toBe('5 pcs')

    await button(wrapper, 'More Basmati rice').trigger('click')
    await flushPromises()
    expect(server.last('PATCH /pantry/p3').body).toEqual({ quantity: 2.5 })
  })

  it('PA10 the amount never goes below zero', async () => {
    server.on('GET /pantry', () => ({ items: [pantryItem({ _id: 'p1', name: 'Flour', quantity: 50, unit: 'g', category: 'grains' })] }))
    server.on('PATCH /pantry/p1', ({ body }) => ({ items: [pantryItem({ _id: 'p1', name: 'Flour', unit: 'g', category: 'grains', ...body })] }))
    const { wrapper } = await renderPantry()

    await button(wrapper, 'Less Flour').trigger('click')
    await flushPromises()
    expect(server.last('PATCH /pantry/p1').body).toEqual({ quantity: 0 })
    expect(button(wrapper, 'Less Flour').attributes('disabled')).toBeDefined()
    expect(label(rowFor(wrapper, 'Flour'))).toContain('Used up')
  })

  it('PA11 editing fills in the current details and saves the changes', async () => {
    server.on('PATCH /pantry/p2', ({ body }) => ({ items: startingPantry().items.map((i) => (i._id === 'p2' ? { ...i, ...body } : i)) }))
    const { wrapper } = await renderPantry()

    await button(wrapper, 'Edit Milk').trigger('click')
    const form = wrapper.get('[data-testid="pantry-edit-form"]')
    expect(form.get('[data-testid="pantry-edit-name"]').element.value).toBe('Milk')
    expect(form.get('input[aria-label="Use by date"]').element.value).toBe('2026-11-06')

    await form.get('[data-testid="pantry-edit-qty"]').setValue(0.5)
    await form.get('input[aria-label="Use by date"]').setValue('')
    await form.trigger('submit')
    await flushPromises()

    expect(server.last('PATCH /pantry/p2').body).toEqual({
      name: 'Milk', quantity: 0.5, unit: 'l', category: 'dairy', expiryDate: null,
    })
    expect(wrapper.find('[data-testid="pantry-edit-form"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="pantry-notice"]').text()).toContain('Saved Milk')
  })

  it('PA12 an edit with no name is stopped before it reaches the server', async () => {
    const { wrapper } = await renderPantry()

    await button(wrapper, 'Edit Milk').trigger('click')
    await wrapper.get('[data-testid="pantry-edit-name"]').setValue('   ')
    await wrapper.get('[data-testid="pantry-edit-form"]').trigger('submit')
    await flushPromises()

    expect(server.count('PATCH /pantry/p2')).toBe(0)
    expect(wrapper.get('[role="alert"]').text()).toContain('Ingredient name is required')
  })

  it('PA13 removing asks first, and says how much will be lost', async () => {
    server.on('DELETE /pantry/p1', () => ({ items: startingPantry().items.filter((i) => i._id !== 'p1') }))
    const { wrapper } = await renderPantry()

    await button(wrapper, 'Remove Eggs').trigger('click')
    expect(confirmState.title).toBe('Remove Eggs?')
    expect(confirmState.message).toContain("You'll lose the 6 pieces you have recorded.")
    answerDialog(false)
    await flushPromises()
    expect(server.count('DELETE /pantry/p1')).toBe(0)

    await button(wrapper, 'Remove Eggs').trigger('click')
    answerDialog(true)
    await flushPromises()
    expect(rowNames(wrapper)).not.toContain('Eggs')
    expect(wrapper.get('[data-testid="pantry-notice"]').text()).toContain('Removed Eggs')
  })

  it('PA14 a failed save shows the server\'s reason and keeps the list as it was', async () => {
    server.on('POST /pantry', () => { throw httpError(400, 'Quantity must be more than 0') })
    const { wrapper } = await renderPantry()

    await wrapper.get('[data-testid="pantry-name"]').setValue('Salt')
    await wrapper.get('[data-testid="pantry-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('Quantity must be more than 0')
    expect(rows(wrapper)).toHaveLength(3)
    expect(wrapper.get('[data-testid="pantry-name"]').element.value).toBe('Salt')
  })
})

describe('Pantry: "What can I cook?"', () => {
  it('PA15 sends the chosen filters and passes the suggestions to the modal', async () => {
    server
      .on('GET /pantry', () => ({ items: [...startingPantry().items, pantryItem({ _id: 'p4', name: 'Tofu', quantity: 0, category: 'other' })] }))
      .on('GET /pantry/suggestions', () => ({ recipes: [{ id: 1, title: 'Egg fried rice' }], pantryCount: 3 }))
    const { wrapper } = await renderPantry()

    await wrapper.get('[data-testid="go-suggestions"]').trigger('click')
    wrapper.findComponent({ name: 'SuggestionModal' }).vm
      .$emit('search', { diet: 'vegetarian', intolerances: ['dairy', 'egg'], maxReadyTime: 30 })
    await flushPromises()

    expect(server.last('GET /pantry/suggestions').params).toEqual({ diet: 'vegetarian', intolerances: 'dairy,egg', maxReadyTime: 30 })
    expect(wrapper.get('[data-testid="suggestions-stub"]').text()).toBe('3 in stock, 1 recipes')
  })

  it('PA16 no filters chosen -> none are sent', async () => {
    server.on('GET /pantry/suggestions', () => ({ recipes: [] }))
    const { wrapper } = await renderPantry()

    await wrapper.get('[data-testid="go-suggestions"]').trigger('click')
    wrapper.findComponent({ name: 'SuggestionModal' }).vm.$emit('search', { diet: '', intolerances: [], maxReadyTime: null })
    await flushPromises()

    expect(server.last('GET /pantry/suggestions').params).toEqual({})
  })
})

describe('Pantry: spoon and cup measures', () => {
  it('PA17 picking cups says it will be saved as g or ml, and the message shows what was saved', async () => {
    server.on('POST /pantry', () => ({ items: [...startingPantry().items, pantryItem({ _id: 'p9', name: 'Jasmine rice', quantity: 370, unit: 'g', category: 'grains' })] }))
    const { wrapper } = await renderPantry()
    const unit = wrapper.get('[data-testid="pantry-form"]').get('#ing-unit')

    expect(wrapper.find('[data-testid="pantry-unit-hint"]').exists()).toBe(false)
    await unit.setValue('cup')
    expect(wrapper.get('[data-testid="pantry-unit-hint"]').text()).toBe('Saved as g or ml')

    await wrapper.get('[data-testid="pantry-name"]').setValue('Jasmine rice')
    await wrapper.get('[data-testid="pantry-qty"]').setValue(2)
    await wrapper.get('[data-testid="pantry-form"]').trigger('submit')
    await flushPromises()

    expect(server.last('POST /pantry').body).toMatchObject({ name: 'Jasmine rice', quantity: 2, unit: 'cup' })
    expect(wrapper.get('[data-testid="pantry-notice"]').text()).toContain('Added Jasmine rice (370 g)')
  })

  it('PA18 the edit form only offers the units the pantry stores', async () => {
    const { wrapper } = await renderPantry()
    await button(wrapper, 'Edit Milk').trigger('click')
    const options = wrapper.get('[data-testid="pantry-edit-form"]').findAll('select[aria-label="Unit"] option').map((o) => o.text())
    expect(options).toEqual(['pcs', 'g', 'kg', 'ml', 'l'])
  })
})

