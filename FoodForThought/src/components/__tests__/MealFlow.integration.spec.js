import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, DOMWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import Planner from '@/views/Planner.vue'
import ShoppingList from '@/views/ShoppingList.vue'
import Pantry from '@/views/Pantry.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import {
  server, renderPage, text, button, label, flushPromises, confirmState, answerDialog,
  plannerEntry, recipeOption, shoppingItem, pantryItem,
} from './mealFlowSupport'

vi.mock('axios', async () => (await import('./fakeServer')).axiosModule)
enableAutoUnmount(afterEach)

const TODAY = new Date(2026, 10, 4, 10, 0, 0)
const THIS_WEEK = '2026-11-02'

const withDialog = (Page) => defineComponent({ name: 'WithDialog', render: () => [h(Page), h(ConfirmDialog)] })

const body = () => new DOMWrapper(document.body)
const dialog = () => body().find('[role="alertdialog"]')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  server.reset()
})
afterEach(() => {
  vi.useRealTimers()
  if (confirmState.open) answerDialog(false)
})

describe('Planner + AddMealModal', () => {
  beforeEach(() => {
    server
      .on('GET /planner', () => ({ id: 'plan1', entries: [] }))
      .on('GET /planner/recipe-options', () => [recipeOption({ id: 'r2', title: 'Tofu Stir-fry' })])
      .on('POST /planner/entries', ({ body: b }) => ({
        id: 'plan1',
        entries: [plannerEntry({ id: 'e9', dayOfWeek: b.dayOfWeek, mealSlot: b.mealSlot, servings: b.servings,
          recipe: { ...plannerEntry().recipe, title: 'Tofu Stir-fry' } })],
      }))
  })

  it('I01 the user picks a suggested recipe, a meal time and servings, and it lands on the plan', async () => {
    const { wrapper } = await renderPage(Planner, { path: '/planner', attach: true })

    await button(wrapper, 'Add Meal').trigger('click')
    const modal = body().get('[aria-labelledby="modal-add-title"]')
    expect(label(modal.get('[data-testid="add-meal-quick"]'))).toContain('Tofu Stir-fry')

    await button(modal, 'Lunch').trigger('click')
    await button(modal, 'Increase servings').trigger('click')
    await modal.findAll('button').find((b) => label(b).startsWith('Tofu Stir-fry')).trigger('click')
    await button(modal, 'Add to plan').trigger('click')
    await flushPromises()

    expect(server.last('POST /planner/entries').body).toEqual({
      start: THIS_WEEK, dayOfWeek: 2, mealSlot: 'lunch', servings: 3, recipeId: 'r2',
    })
    expect(body().find('[aria-labelledby="modal-add-title"]').exists()).toBe(false)
    const card = wrapper.get('[data-testid="meal-card"]')
    expect(text(card)).toContain('Tofu Stir-fry')
    expect(text(card)).toContain('Lunch')
    expect(text(card)).toContain('3 servings')
  })

  it('I02 typing a search waits for the user to stop, then offers Spoonacular recipes', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(TODAY)
    server.on('GET /planner/recipe-search', ({ params }) => ({
      saved: [],
      online: [{ id: 'sp-716429', title: 'Curry Laksa', source: 'spoonacular', externalId: 716429 }],
      query: params.search,
    }))
    const { wrapper } = await renderPage(Planner, { path: '/planner', attach: true })

    await button(wrapper, 'Add Meal').trigger('click')
    const modal = body().get('[aria-labelledby="modal-add-title"]')
    await modal.get('#add-meal-search').setValue('lak')
    await modal.get('#add-meal-search').setValue('laksa')
    await vi.advanceTimersByTimeAsync(600)
    await flushPromises()

    expect(server.count('GET /planner/recipe-search')).toBe(1)
    expect(server.last('GET /planner/recipe-search').params).toEqual({ search: 'laksa' })
    expect(label(modal.get('[data-testid="add-meal-online"]'))).toContain('Curry Laksa')

    await modal.findAll('button').find((b) => label(b).startsWith('Curry Laksa')).trigger('click')
    await button(modal, 'Add to plan').trigger('click')
    await flushPromises()
    expect(server.last('POST /planner/entries').body).toMatchObject({ spoonacularId: 716429 })
  })
})

describe('Planner + ConfirmDialog', () => {
  it('I03 removing a meal shows the themed dialog; Cancel keeps it, "Remove meal" removes it', async () => {
    server
      .on('GET /planner', () => ({ id: 'plan1', entries: [plannerEntry({ dayOfWeek: 2 })] }))
      .on('GET /planner/recipe-options', () => [])
      .on('DELETE /planner/entries/e1', () => ({ id: 'plan1', entries: [] }))
    const { wrapper } = await renderPage(withDialog(Planner), { path: '/planner', attach: true })

    await button(wrapper, 'Remove Chicken Rice').trigger('click')
    await flushPromises()
    expect(dialog().get('h2').text()).toBe('Remove Chicken Rice?')
    expect(document.activeElement?.textContent.trim()).toBe('Cancel')

    await button(dialog(), 'Cancel').trigger('click')
    await flushPromises()
    expect(dialog().exists()).toBe(false)
    expect(server.count('DELETE /planner/entries/e1')).toBe(0)

    await button(wrapper, 'Remove Chicken Rice').trigger('click')
    await flushPromises()
    await button(dialog(), 'Remove meal').trigger('click')
    await flushPromises()
    expect(server.count('DELETE /planner/entries/e1')).toBe(1)
    expect(wrapper.findAll('[data-testid="meal-card"]')).toHaveLength(0)
  })
})

describe('ShoppingList + ShoppingModeModal', () => {
  it('I04 in shopping mode the user ticks items into the basket, then adds them to the pantry', async () => {
    const items = [
      shoppingItem({ _id: 'i1', name: 'Ginger', quantity: 50, unit: 'g', category: 'produce' }),
      shoppingItem({ _id: 'i2', name: 'Eggs', quantity: 6, unit: 'piece', category: 'dairy-eggs' }),
    ]
    server
      .on('GET /shoppinglist', () => ({ weekStart: THIS_WEEK, generatedAt: '2026-11-02', items: items.map((i) => ({ ...i })) }))
      .on('PATCH /shoppinglist/items/i1', ({ body: b }) => ({
        ...items[0], purchased: b.purchased,
        basket: { name: 'Ginger', quantity: 50, unit: 'g', category: 'produce', expiryDate: null, addToPantry: true },
      }))
      .on('POST /shoppinglist/add-to-pantry', () => ({
        added: 1, skipped: [],
        list: { weekStart: THIS_WEEK, generatedAt: '2026-11-02', items: [{ ...items[0], purchased: true, addedToPantry: true }, items[1]] },
      }))
    const { wrapper } = await renderPage(ShoppingList, { path: `/shoppinglist?start=${THIS_WEEK}`, attach: true })

    await wrapper.get('[data-testid="start-shopping"]').trigger('click')
    const modal = body().get('[data-testid="shopping-mode"]')
    expect(modal.text()).toContain('0 of 2 in your basket')

    await modal.get('[aria-label="Put Ginger in basket"]').trigger('click')
    await flushPromises()
    expect(server.last('PATCH /shoppinglist/items/i1').body).toEqual({ purchased: true })
    expect(modal.text()).toContain('1 of 2 in your basket')
    expect(modal.findAll('[data-testid="sm-basket-item"]').map(label).join(' ')).toContain('Ginger')

    await modal.get('[data-testid="sm-finish"]').trigger('click')
    expect(label(modal.get('[data-testid="sm-review"]'))).toContain('Add 1 item to your pantry?')
    await modal.get('[data-testid="sm-confirm"]').trigger('click')
    await flushPromises()

    expect(server.count('POST /shoppinglist/add-to-pantry')).toBe(1)
    expect(modal.get('[role="status"]').text()).toContain('Added 1 item to your pantry.')
    expect(modal.get('[data-testid="sm-added-note"]').text()).toContain('1 item already added to your pantry')

    await button(modal, 'Close shopping mode').trigger('click')
    await flushPromises()
    expect(body().find('[data-testid="shopping-mode"]').exists()).toBe(false)
    expect(label(wrapper)).toContain('Added to pantry')
  })
})

describe('Pantry + SuggestionModal / ConfirmDialog', () => {
  beforeEach(() => {
    server.on('GET /pantry', () => ({ items: [pantryItem({ _id: 'p1', name: 'Eggs', quantity: 6 }), pantryItem({ _id: 'p2', name: 'Rice', quantity: 1, unit: 'kg', category: 'grains' })] }))
  })

  it('I05 "What can I cook?" searches as soon as it opens, and filters re-run the search', async () => {
    const suggestion = {
      spoonacularId: 1, title: 'Egg Fried Rice', image: '', score: 86, readyInMinutes: 20, diets: ['vegetarian'],
      missedIngredients: [{ name: 'spring onion' }], missedCount: 1,
      breakdown: { coveragePercent: 80, points: { coverage: 50 } },
    }
    server.on('GET /pantry/suggestions', () => ({ recipes: [suggestion], pantryCount: 2 }))
    const { wrapper } = await renderPage(Pantry, { path: '/pantry', attach: true })

    await wrapper.get('[data-testid="go-suggestions"]').trigger('click')
    await flushPromises()
    const modal = body().get('[data-testid="suggestions-modal"]')
    expect(server.count('GET /pantry/suggestions')).toBe(1)
    const card = modal.get('[data-testid="suggestion-card"]')
    expect(card.text()).toContain('Egg Fried Rice')
    expect(card.get('[data-testid="suggestion-missing"]').text()).toContain('1 missing: spring onion')

    await button(modal, 'Vegetarian').trigger('click')
    await button(modal, 'egg').trigger('click')
    await modal.get('form').trigger('submit')
    await flushPromises()
    expect(server.last('GET /pantry/suggestions').params).toEqual({ diet: 'vegetarian', intolerances: 'egg' })

    await modal.get('[data-testid="suggestions-close"]').trigger('click')
    expect(body().find('[data-testid="suggestions-modal"]').exists()).toBe(false)
  })

  it('I06 removing an ingredient goes through the themed dialog, and Esc cancels', async () => {
    server.on('DELETE /pantry/p1', () => ({ items: [pantryItem({ _id: 'p2', name: 'Rice', quantity: 1, unit: 'kg', category: 'grains' })] }))
    const { wrapper } = await renderPage(withDialog(Pantry), { path: '/pantry', attach: true })

    await button(wrapper, 'Remove Eggs').trigger('click')
    await flushPromises()
    expect(dialog().text()).toContain('Remove Eggs?')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(dialog().exists()).toBe(false)
    expect(server.count('DELETE /pantry/p1')).toBe(0)

    await button(wrapper, 'Remove Eggs').trigger('click')
    await flushPromises()
    await button(dialog(), 'Remove item').trigger('click')
    await flushPromises()
    expect(server.count('DELETE /pantry/p1')).toBe(1)
    expect(wrapper.findAll('[data-testid="pantry-item"]').map((r) => label(r))).toHaveLength(1)
  })
})
