// Planner.spec.js - component tests for the Weekly Meal Planner (src/views/Planner.vue)
//
// The page is tested on its own: its three modals (AddMealModal, SwapMealModal, RecipeModal)
// are replaced by small stubs that just emit the events the real ones would. The real
// modals are tested together with the page in MealFlow.integration.spec.js.
//
// Run:  npx vitest run src/components/__tests__/Planner.spec.js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import Planner from '@/views/Planner.vue'
import {
  server, httpError, deferred, renderPage, text, button, label, answerDialog, confirmState, flushPromises,
  plannerEntry, recipeOption,
} from './mealFlowSupport'

vi.mock('axios', async () => (await import('./fakeServer')).axiosModule)
enableAutoUnmount(afterEach)

// Fixed "today" so the week and the selected day never depend on when the tests run:
// Wednesday 4 Nov 2026 -> the week starts Monday 2 Nov, and Wednesday is day index 2.
const TODAY = new Date(2026, 10, 4, 10, 0, 0)
const THIS_WEEK = '2026-11-02'
const WED = 2

// Stubs that stand in for the modals: they show their props and let the test emit their events
const AddMealModal = {
  name: 'AddMealModal',
  props: ['defaultDate', 'defaultSlot', 'recipes', 'searchResults'],
  emits: ['add', 'close', 'search'],
  template: '<div data-testid="add-meal-stub">{{ defaultDate }} {{ defaultSlot }}</div>',
}
const SwapMealModal = {
  name: 'SwapMealModal',
  props: ['entry', 'recipes'],
  emits: ['swap', 'close'],
  template: '<div data-testid="swap-stub">{{ entry.recipe.title }}</div>',
}
const stubs = { AddMealModal, SwapMealModal, RecipeModal: true }

const week = (entries) => ({ id: 'plan1', entries })
const renderPlanner = (path = '/planner') => renderPage(Planner, { path, stubs })
const cards = (wrapper) => wrapper.findAll('[data-testid="meal-card"]')
const statusButton = (card, name) => card.findAll('[role="radio"]').find((b) => label(b) === name)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  server.reset()
  server
    .on('GET /planner', () => week([plannerEntry({ dayOfWeek: WED })]))
    .on('GET /planner/recipe-options', () => [recipeOption()])
})
afterEach(() => {
  vi.useRealTimers()
  if (confirmState.open) answerDialog(false) // never leave the shared dialog open for the next test
})

describe('Planner: loading and showing the week', () => {
  it('P01 asks the server for this week and shows today\'s meals', async () => {
    const { wrapper } = await renderPlanner()

    expect(server.last('GET /planner').params).toEqual({ start: THIS_WEEK })
    expect(text(wrapper)).toContain('Week of Nov 2 – Nov 8')
    expect(text(wrapper)).toContain('This week')
    expect(text(wrapper)).toContain('Wednesday, Nov 4')

    expect(cards(wrapper)).toHaveLength(1)
    const card = text(cards(wrapper)[0])
    expect(card).toContain('Chicken Rice')
    expect(card).toContain('600 kcal')
    expect(card).toContain('2 servings')
    expect(card).toContain('Pantry: chicken rice') // the ingredients already at home (not ginger)
    expect(card).not.toMatch(/Pantry:.*ginger/)
  })

  it('P02 shows the weekly stats, and skipped meals add no calories', async () => {
    server.on('GET /planner', () => week([
      plannerEntry({ id: 'e1', dayOfWeek: WED, status: 'Cooked' }), // 600 kcal, eaten
      plannerEntry({ id: 'e2', dayOfWeek: WED, mealSlot: 'lunch', status: 'Skipped' }), // not eaten
    ]))
    const { wrapper } = await renderPlanner()

    expect(text(wrapper)).toContain('Meals Cooked 1 / 2 planned')
    expect(text(wrapper)).toContain('Daily Calorie Avg 600 kcal')
    // Lunch is listed before dinner, whatever order the server sends them in
    expect(cards(wrapper).map((c) => c.text())[0]).toContain('Lunch')
  })

  it('P03 splits the week\'s calories into protein, carbs and fat', async () => {
    // 35 g protein x4 = 140, 70 g carbs x4 = 280, 20 g fat x9 = 180  -> 600 kcal in total
    const { wrapper } = await renderPlanner()
    const bar = wrapper.get('[data-testid="macro-split"] [role="img"]')
    expect(bar.attributes('aria-label')).toBe('Protein 23%, Carbs 47%, Fat 30%')
  })

  it('P04 an empty day invites the user to add a meal, and the list cannot be built from nothing', async () => {
    server.on('GET /planner', () => week([]))
    const { wrapper } = await renderPlanner()

    expect(text(wrapper)).toContain('Nothing planned for Wednesday, Nov 4 yet')
    expect(text(wrapper)).toContain('Plan some meals for this week to build your grocery list.')
    expect(button(wrapper, 'Build Shopping List').attributes('disabled')).toBeDefined()
  })

  it('P05 shows the server\'s message when the week cannot be loaded', async () => {
    server.on('GET /planner', () => { throw httpError(500, 'Database is offline') })
    const { wrapper } = await renderPlanner()

    expect(wrapper.get('[role="alert"]').text()).toContain('Database is offline')
    expect(cards(wrapper)).toHaveLength(0)
  })
})

describe('Planner: moving between weeks and days', () => {
  it('P06 next / previous / "This week" load the matching week', async () => {
    const { wrapper } = await renderPlanner()

    await button(wrapper, 'Next week').trigger('click')
    await flushPromises()
    expect(server.last('GET /planner').params.start).toBe('2026-11-09')
    expect(text(wrapper)).toContain('Next week')

    await button(wrapper, 'This week').trigger('click')
    await button(wrapper, 'Previous week').trigger('click')
    await flushPromises()
    expect(server.last('GET /planner').params.start).toBe('2026-10-26')
    expect(text(wrapper)).toContain('Last week')
  })

  it('P07 a slow answer for the week the user already left is ignored', async () => {
    const slow = deferred()
    server.on('GET /planner', ({ params }) =>
      params.start === THIS_WEEK ? slow.promise : week([plannerEntry({ dayOfWeek: 0, recipe: { ...plannerEntry().recipe, title: 'Next-week Laksa' } })]))
    const { wrapper } = await renderPlanner()

    await button(wrapper, 'Next week').trigger('click') // user moves on before this week arrives
    await flushPromises()
    slow.resolve({ ...week([plannerEntry({ dayOfWeek: 0 })]) }) // old week finally answers
    await flushPromises()

    expect(text(wrapper)).toContain('Next-week Laksa')
    expect(text(wrapper)).not.toContain('Chicken Rice')
  })

  it('P08 clicking a day tab shows that day\'s meals', async () => {
    server.on('GET /planner', () => week([plannerEntry({ dayOfWeek: 0 })])) // Monday only
    const { wrapper } = await renderPlanner()
    expect(cards(wrapper)).toHaveLength(0) // today (Wednesday) is empty

    const monday = wrapper.findAll('button').find((b) => b.text().startsWith('Mon 2'))
    expect(text(monday)).toContain('0/1') // tab shows cooked / planned
    await monday.trigger('click')

    expect(text(wrapper)).toContain('Monday, Nov 2')
    expect(cards(wrapper)).toHaveLength(1)
  })
})

describe('Planner: changing a meal', () => {
  it('P09 marking a meal Cooked saves it and says what was taken from the pantry', async () => {
    server.on('PATCH /planner/entries/e1', () => ({
      ...week([plannerEntry({ dayOfWeek: WED, status: 'Cooked' })]),
      pantryUpdate: {
        deducted: [{ name: 'chicken', quantity: 300, unit: 'g' }, { name: 'rice', quantity: 185, unit: 'g' }],
        skipped: [{ name: 'ginger', reason: 'not in pantry' }],
      },
    }))
    const { wrapper } = await renderPlanner()

    await statusButton(cards(wrapper)[0], 'Cooked').trigger('click')
    await flushPromises()

    expect(server.last('PATCH /planner/entries/e1').body).toEqual({ status: 'Cooked' })
    expect(statusButton(cards(wrapper)[0], 'Cooked').attributes('aria-checked')).toBe('true')
    expect(label(wrapper.get('.pantry-toast'))).toBe('Deducted from your pantry: chicken, rice')
  })

  it('P10 undoing Cooked says the ingredients went back into the pantry', async () => {
    server
      .on('GET /planner', () => week([plannerEntry({ dayOfWeek: WED, status: 'Cooked' })]))
      .on('PATCH /planner/entries/e1', () => ({
        ...week([plannerEntry({ dayOfWeek: WED, status: 'Planned' })]),
        pantryUpdate: { restored: [{ name: 'chicken', quantity: 300, unit: 'g' }] },
      }))
    const { wrapper } = await renderPlanner()

    await statusButton(cards(wrapper)[0], 'Planned').trigger('click')
    await flushPromises()

    expect(label(wrapper.get('.pantry-toast'))).toBe('Put back in your pantry: chicken')
  })

  it('P10b a long list is shortened to three names', async () => {
    const used = ['chicken', 'rice', 'garlic', 'ginger', 'soy sauce'].map((name) => ({ name, quantity: 1, unit: 'g' }))
    server.on('PATCH /planner/entries/e1', () => ({
      ...week([plannerEntry({ dayOfWeek: WED, status: 'Cooked' })]),
      pantryUpdate: { deducted: used, skipped: [] },
    }))
    const { wrapper } = await renderPlanner()

    await statusButton(cards(wrapper)[0], 'Cooked').trigger('click')
    await flushPromises()
    expect(label(wrapper.get('.pantry-toast'))).toBe('Deducted from your pantry: chicken, rice, garlic and 2 more')
  })

  it('P10c cooking a meal with nothing from the pantry still confirms it, without changing the pantry', async () => {
    server.on('PATCH /planner/entries/e1', () => ({
      ...week([plannerEntry({ dayOfWeek: WED, status: 'Cooked' })]),
      pantryUpdate: { deducted: [], skipped: [{ name: 'tofu', reason: 'not in pantry' }] },
    }))
    const { wrapper } = await renderPlanner()

    await statusButton(cards(wrapper)[0], 'Cooked').trigger('click')
    await flushPromises()
    expect(label(wrapper.get('.pantry-toast'))).toBe('Marked as cooked. None of its ingredients were in your pantry.')
  })

  it('P11 if saving the status fails, the card still shows the saved status', async () => {
    server.on('PATCH /planner/entries/e1', () => { throw httpError(500, 'Could not reach the database') })
    const { wrapper } = await renderPlanner()

    await statusButton(cards(wrapper)[0], 'Skipped').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('Could not reach the database')
    expect(statusButton(cards(wrapper)[0], 'Planned').attributes('aria-checked')).toBe('true')
    expect(statusButton(cards(wrapper)[0], 'Skipped').attributes('aria-checked')).toBe('false')
  })

  it('P12 changing the meal time sends the new slot to the server', async () => {
    server.on('PATCH /planner/entries/e1', () => week([plannerEntry({ dayOfWeek: WED, mealSlot: 'lunch' })]))
    const { wrapper } = await renderPlanner()

    await cards(wrapper)[0].get('select[aria-label="Meal time"]').setValue('lunch')
    await flushPromises()

    expect(server.last('PATCH /planner/entries/e1').body).toEqual({ mealSlot: 'lunch' })
    expect(text(cards(wrapper)[0])).toContain('Lunch')
  })

  it('P13 removing asks first: Cancel keeps the meal, Remove deletes it', async () => {
    server.on('DELETE /planner/entries/e1', () => week([]))
    const { wrapper } = await renderPlanner()

    await button(wrapper, 'Remove Chicken Rice').trigger('click')
    expect(confirmState.title).toBe('Remove Chicken Rice?')
    answerDialog(false)
    await flushPromises()
    expect(server.count('DELETE /planner/entries/e1')).toBe(0)
    expect(cards(wrapper)).toHaveLength(1)

    await button(wrapper, 'Remove Chicken Rice').trigger('click')
    answerDialog(true)
    await flushPromises()
    expect(server.count('DELETE /planner/entries/e1')).toBe(1)
    expect(cards(wrapper)).toHaveLength(0)
  })

  it('P14 the remove warning for a cooked meal says the pantry is not refilled', async () => {
    server.on('GET /planner', () => week([plannerEntry({ dayOfWeek: WED, status: 'Cooked' })]))
    const { wrapper } = await renderPlanner()

    await button(wrapper, 'Remove Chicken Rice').trigger('click')
    expect(confirmState.message).toContain('What it used from your pantry stays used.')
  })

  it('P15 swapping a meal sends the chosen recipe', async () => {
    server.on('PATCH /planner/entries/e1', () => week([plannerEntry({ dayOfWeek: WED })]))
    const { wrapper } = await renderPlanner()

    await button(wrapper, 'Swap').trigger('click')
    expect(wrapper.get('[data-testid="swap-stub"]').text()).toBe('Chicken Rice')
    wrapper.findComponent({ name: 'SwapMealModal' }).vm.$emit('swap', { entryId: 'e1', recipe: { id: 'r2' } })
    await flushPromises()

    expect(server.last('PATCH /planner/entries/e1').body).toEqual({ recipeId: 'r2' })
  })
})

describe('Planner: adding meals', () => {
  it('P16 "Add Meal" opens the modal for the selected day, and adding a Spoonacular recipe saves it', async () => {
    server.on('POST /planner/entries', () => week([
      plannerEntry({ dayOfWeek: WED }),
      plannerEntry({ id: 'e2', dayOfWeek: 4, mealSlot: 'lunch', recipe: { ...plannerEntry().recipe, title: 'Pad Thai' } }),
    ]))
    const { wrapper } = await renderPlanner()

    await button(wrapper, 'Add Meal').trigger('click')
    expect(wrapper.get('[data-testid="add-meal-stub"]').text()).toBe('2026-11-04 Dinner')

    wrapper.findComponent({ name: 'AddMealModal' }).vm.$emit('add', {
      date: '2026-11-06', mealSlot: 'Lunch', servings: 3,
      recipe: { id: 'sp-1', source: 'spoonacular', externalId: 716429 },
    })
    await flushPromises()

    expect(server.last('POST /planner/entries').body).toEqual({
      start: THIS_WEEK, dayOfWeek: 4, mealSlot: 'lunch', servings: 3, spoonacularId: 716429,
    })
    expect(text(wrapper)).toContain('Friday, Nov 6') // jumps to the day the meal went on
    expect(text(wrapper)).toContain('Pad Thai')
    expect(server.count('GET /planner/recipe-options')).toBe(2) // reloaded so the new recipe can be picked again
  })

  it('P17 a saved recipe is added by its id', async () => {
    server.on('POST /planner/entries', () => week([plannerEntry({ dayOfWeek: WED })]))
    const { wrapper } = await renderPlanner()

    await button(wrapper, 'Add Meal').trigger('click')
    wrapper.findComponent({ name: 'AddMealModal' }).vm.$emit('add', {
      date: '2026-11-04', mealSlot: 'Breakfast', servings: 1, recipe: { id: 'r2', source: 'saved' },
    })
    await flushPromises()

    expect(server.last('POST /planner/entries').body).toMatchObject({ dayOfWeek: WED, mealSlot: 'breakfast', recipeId: 'r2' })
    expect(server.last('POST /planner/entries').body).not.toHaveProperty('spoonacularId')
  })

  it('P18 the Dashboard link /planner?day=4&add=lunch opens Add Meal for Friday lunch', async () => {
    const { wrapper, router } = await renderPlanner('/planner?day=4&add=lunch')

    expect(wrapper.get('[data-testid="add-meal-stub"]').text()).toBe('2026-11-06 Lunch')
    expect(router.currentRoute.value.query).toEqual({}) // refreshing won't reopen it
  })

  it('P19 a bad link (/planner?day=9&add=brunch) is ignored', async () => {
    const { wrapper } = await renderPlanner('/planner?day=9&add=brunch')
    expect(wrapper.find('[data-testid="add-meal-stub"]').exists()).toBe(false)
  })
})

describe('Planner: building the shopping list', () => {
  it('P20 "Build Shopping List" rebuilds the list, shows how many to buy, then opens it', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(TODAY)
    server.on('POST /shoppinglist/generate', () => ({
      items: [
        { name: 'ginger', quantity: 50, purchased: false }, // to buy
        { name: 'rice', quantity: 0, purchased: false }, // pantry covers it
        { name: 'soy sauce', quantity: 1, purchased: true }, // already bought
        { name: 'spring onion', quantity: 2, purchased: false }, // to buy
      ],
    }))
    const { wrapper, router } = await renderPlanner()

    await button(wrapper, 'Build Shopping List').trigger('click')
    await flushPromises()
    expect(server.last('POST /shoppinglist/generate').body).toEqual({ start: THIS_WEEK })
    expect(text(wrapper)).toContain('2 Items to Buy')

    await vi.advanceTimersByTimeAsync(900) // the label stays up for 0.9 s
    vi.useRealTimers()
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe(`/shoppinglist?start=${THIS_WEEK}`))
  })

  it('P21 if the list cannot be built the user is told and stays on the planner', async () => {
    server.on('POST /shoppinglist/generate', () => { throw httpError(503, 'Shopping list service is down') })
    const { wrapper, router } = await renderPlanner()

    await button(wrapper, 'Build Shopping List').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('Shopping list service is down')
    expect(button(wrapper, 'Build Shopping List').attributes('disabled')).toBeUndefined() // can try again
    expect(router.currentRoute.value.path).toBe('/planner')
  })
})
