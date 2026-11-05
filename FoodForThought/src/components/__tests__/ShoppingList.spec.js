import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import ShoppingList from '@/views/ShoppingList.vue'
import {
  server, httpError, renderPage, text, button, label, flushPromises, shoppingItem,
} from './mealFlowSupport'

vi.mock('axios', async () => (await import('./fakeServer')).axiosModule)
enableAutoUnmount(afterEach)

const TODAY = new Date(2026, 10, 4, 10, 0, 0)
const THIS_WEEK = '2026-11-02'

const ShoppingModeModal = {
  name: 'ShoppingModeModal',
  props: ['items', 'sections', 'saving', 'adding', 'error', 'notice'],
  emits: ['toggle', 'save-basket', 'add-to-pantry', 'close'],
  template: '<div data-testid="shopping-mode-stub">{{ items.length }} items</div>',
}

const ginger = shoppingItem({ _id: 'i1', name: 'Ginger', quantity: 50, unit: 'g', category: 'produce' })
const rice = shoppingItem({ _id: 'i2', name: 'Jasmine rice', quantity: 0, pantryQuantity: 300, unit: 'g', category: 'grains-noodles' })
const milk = shoppingItem({ _id: 'i3', name: 'Milk', quantity: 500, unit: 'ml', pantryQuantity: 200, category: 'dairy-eggs', purchased: true })
const soySauce = shoppingItem({
  _id: 'i4', name: 'Soy sauce', quantity: 2, unit: 'tbsp', category: 'canned-sauces',
  usedIn: [{ title: 'Chicken Rice' }, { title: 'Fried Rice' }, { title: 'Laksa' }],
})
const fullList = () => ({ weekStart: THIS_WEEK, generatedAt: '2026-11-02T01:00:00Z', items: [ginger, rice, milk, soySauce].map((i) => ({ ...i })) })

const renderList = (path = `/shoppinglist?start=${THIS_WEEK}`) => renderPage(ShoppingList, { path, stubs: { ShoppingModeModal } })
const rows = (wrapper) => wrapper.findAll('[data-testid="shopping-item"]')
const rowName = (row) => row.get('input[type="checkbox"]').attributes('aria-label').replace('Bought ', '')
const rowFor = (wrapper, name) => rows(wrapper).find((r) => rowName(r) === name)
const sectionTitles = (wrapper) =>
  wrapper.findAll('section').filter((s) => s.find('[data-testid="shopping-item"]').exists()).map((s) => s.get('h2').text())

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  server.reset()
  server.on('GET /shoppinglist', fullList)
})
afterEach(() => vi.useRealTimers())

describe('Shopping list: showing the list', () => {
  it('S01 any date in the link opens the list for that whole week (Monday start)', async () => {
    const { wrapper } = await renderList('/shoppinglist?start=2026-11-05')
    expect(server.last('GET /shoppinglist').params).toEqual({ start: THIS_WEEK })
    expect(text(wrapper)).toContain('Week of 2 Nov – 8 Nov 2026')
    expect(text(wrapper)).toContain('From 3 recipes in your meal plan')
  })

  it('S02 items are grouped in shopping order, with chilled sections last', async () => {
    const { wrapper } = await renderList()
    expect(sectionTitles(wrapper)).toEqual(['Canned Goods & Sauces', 'Fruit & Vegetables', 'Dairy & Eggs'])
    expect(text(wrapper)).toContain('Keep chilled')
  })

  it('S03 items the pantry fully covers are hidden until the user asks to see them', async () => {
    const { wrapper } = await renderList()
    expect(rowFor(wrapper, 'Jasmine rice')).toBeUndefined()

    const hideToggle = wrapper.findAll('label').find((l) => label(l) === 'Hide items already in my pantry')
    await hideToggle.get('input').setValue(false)
    const riceRow = rowFor(wrapper, 'Jasmine rice')
    expect(label(riceRow)).toContain('In pantry')
    expect(label(riceRow)).toContain('300 g needed, all in your pantry')
    expect(riceRow.get('input[type="checkbox"]').attributes('disabled')).toBeDefined()
  })

  it('S04 progress counts only things to buy, and the filters narrow the list', async () => {
    const { wrapper } = await renderList()
    expect(text(wrapper)).toContain('1 of 3 bought')
    expect(text(wrapper)).toContain('2 covered by your pantry')

    await button(wrapper, 'To Buy (2)').trigger('click')
    expect(rows(wrapper).map(rowName)).toEqual(['Soy sauce', 'Ginger'])

    await button(wrapper, 'In Pantry (2)').trigger('click')
    expect(rows(wrapper).map(rowName)).toEqual(['Jasmine rice', 'Milk'])
  })

  it('S05 each line says what it is for and how much comes from the pantry', async () => {
    const { wrapper } = await renderList()
    expect(label(rowFor(wrapper, 'Soy sauce'))).toContain('for Chicken Rice, Fried Rice, +1 more')
    expect(label(rowFor(wrapper, 'Milk'))).toContain('200 ml from pantry')
    expect(label(rowFor(wrapper, 'Ginger'))).toContain('50 g')
  })

  it('S06 with no list yet, the user can build one from the meal plan', async () => {
    server
      .on('GET /shoppinglist', () => ({ weekStart: THIS_WEEK, generatedAt: null, items: [] }))
      .on('POST /shoppinglist/generate', fullList)
    const { wrapper } = await renderList()
    expect(text(wrapper)).toContain('No shopping list for this week yet')

    await button(wrapper, 'Build from meal plan').trigger('click')
    await flushPromises()

    expect(server.last('POST /shoppinglist/generate').body).toEqual({ start: THIS_WEEK })
    expect(rowFor(wrapper, 'Ginger')).toBeDefined()
  })

  it('S07 a server error is shown in a message the user can dismiss', async () => {
    server.on('GET /shoppinglist', () => { throw httpError(500, 'Could not load the list') })
    const { wrapper } = await renderList()

    expect(wrapper.get('[role="alert"]').text()).toContain('Could not load the list')
    await button(wrapper, 'Dismiss message').trigger('click')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})

describe('Shopping list: weeks', () => {
  it('S08 changing week updates the link and loads that week; "This week" brings it back', async () => {
    const { wrapper, router } = await renderList()
    expect(wrapper.findAll('button').some((b) => label(b) === 'This week')).toBe(false)

    await button(wrapper, 'Next week').trigger('click')
    await flushPromises()
    expect(server.last('GET /shoppinglist').params.start).toBe('2026-11-09')
    expect(router.currentRoute.value.query.start).toBe('2026-11-09')

    await button(wrapper, 'This week').trigger('click')
    await flushPromises()
    expect(server.last('GET /shoppinglist').params.start).toBe(THIS_WEEK)
  })
})

describe('Shopping list: ticking and editing items', () => {
  it('S09 ticking an item saves it as bought', async () => {
    server.on('PATCH /shoppinglist/items/i1', ({ body }) => ({ ...ginger, purchased: body.purchased }))
    const { wrapper } = await renderList()

    await rowFor(wrapper, 'Ginger').get('input[type="checkbox"]').trigger('change')
    await flushPromises()

    expect(server.last('PATCH /shoppinglist/items/i1').body).toEqual({ purchased: true })
    expect(rowFor(wrapper, 'Ginger').classes()).toContain('is-bought')
    expect(text(wrapper)).toContain('2 of 3 bought')
  })

  it('S10 if the tick cannot be saved, it is undone and the user is told', async () => {
    server.on('PATCH /shoppinglist/items/i1', () => { throw httpError(500, 'Saving failed') })
    const { wrapper } = await renderList()

    await rowFor(wrapper, 'Ginger').get('input[type="checkbox"]').trigger('change')
    await flushPromises()

    expect(rowFor(wrapper, 'Ginger').classes()).not.toContain('is-bought')
    expect(wrapper.get('[role="alert"]').text()).toContain('Saving failed')
  })

  it('S11 the user can add their own item, which goes in the chosen section', async () => {
    server.on('POST /shoppinglist/items', ({ body }) => shoppingItem({ _id: 'm1', ...body, source: 'manual', usedIn: [] }))
    const { wrapper } = await renderList()
    const addButton = button(wrapper, 'Add')
    expect(addButton.attributes('disabled')).toBeDefined()

    await wrapper.get('input[aria-label="Item name"]').setValue('  Dish soap ')
    await wrapper.get('input[aria-label="Quantity"]').setValue(2)
    await wrapper.get('select[aria-label="Unit"]').setValue('bottle')
    await wrapper.get('select[aria-label="Section"]').setValue('other')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(server.last('POST /shoppinglist/items').body).toEqual({
      start: THIS_WEEK, name: 'Dish soap', quantity: 2, unit: 'bottle', category: 'other',
    })
    expect(label(rowFor(wrapper, 'Dish soap'))).toContain('Added by you')
    expect(sectionTitles(wrapper)).toContain('Other')
    expect(wrapper.get('input[aria-label="Item name"]').element.value).toBe('')
  })

  it('S12 removing your own item takes it off; if that fails it comes back', async () => {
    const dishSoap = shoppingItem({ _id: 'm1', name: 'Dish soap', source: 'manual', category: 'other', unit: 'bottle', quantity: 1 })
    server
      .on('GET /shoppinglist', () => ({ ...fullList(), items: [{ ...dishSoap }] }))
      .on('DELETE /shoppinglist/items/m1', () => { throw httpError(500, 'Could not remove it') })
    const { wrapper } = await renderList()

    await button(wrapper, 'Remove Dish soap').trigger('click')
    expect(rowFor(wrapper, 'Dish soap')).toBeUndefined()
    await flushPromises()
    expect(rowFor(wrapper, 'Dish soap')).toBeDefined()
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not remove it')
  })
})

describe('Shopping list: into the pantry', () => {
  it('S13 bought items can be added to the pantry, and the user sees what happened', async () => {
    server.on('POST /shoppinglist/add-to-pantry', () => ({
      added: 1,
      skipped: [{ name: 'Rice', reason: 'your pantry stores it in cup' }],
      list: { ...fullList(), items: fullList().items.map((i) => (i._id === 'i3' ? { ...i, addedToPantry: true } : i)) },
    }))
    const { wrapper } = await renderList()

    await button(wrapper, 'Add 1 bought to pantry').trigger('click')
    await flushPromises()

    expect(server.last('POST /shoppinglist/add-to-pantry').body).toEqual({ start: THIS_WEEK })
    expect(text(wrapper)).toContain('Added 1 item to your pantry.')
    expect(text(wrapper)).toContain('Not added: Rice (your pantry stores it in cup). Add these on the Pantry page instead.')
    expect(label(rowFor(wrapper, 'Milk'))).toContain('Added to pantry')
    expect(wrapper.findAll('button').some((b) => label(b).includes('bought to pantry'))).toBe(false)
  })

  it('S14 things the pantry cannot store (e.g. 1 bottle) are not offered for the pantry', async () => {
    server.on('GET /shoppinglist', () => ({
      ...fullList(),
      items: [shoppingItem({ _id: 'm1', name: 'Dish soap', unit: 'bottle', quantity: 1, purchased: true, category: 'other' })],
    }))
    const { wrapper } = await renderList()
    expect(wrapper.findAll('button').some((b) => label(b).includes('bought to pantry'))).toBe(false)
  })

  it('S15 "Start shopping" opens shopping mode, and ticks made there are saved', async () => {
    server.on('PATCH /shoppinglist/items/i1', () => ({ ...ginger, purchased: true }))
    const { wrapper } = await renderList()

    await wrapper.get('[data-testid="start-shopping"]').trigger('click')
    const modal = wrapper.findComponent({ name: 'ShoppingModeModal' })
    expect(modal.props('items')).toHaveLength(4)

    modal.vm.$emit('toggle', modal.props('items').find((i) => i._id === 'i1'))
    await flushPromises()
    expect(server.last('PATCH /shoppinglist/items/i1').body).toEqual({ purchased: true })

    modal.vm.$emit('close')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ShoppingModeModal' }).exists()).toBe(false)
  })
})
