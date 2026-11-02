import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import axios from 'axios'
import RecipeComments from '@/components/RecipeComments.vue'
import { renderFeature, flushPromises, button, text, comment, recipe, serverError, deferred } from './featureTestSupport'

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
enableAutoUnmount(afterEach)
beforeEach(() => { vi.resetAllMocks(); axios.get.mockResolvedValue({ data: [] }) })
const renderComments = options => renderFeature(RecipeComments, { props: { recipeId: recipe._id }, ...options })

describe('RecipeComments in isolation', () => {
  it('R01 asks a guest to log in before reading or adding comments', async () => {
    const { wrapper } = await renderComments({ loggedIn: false })
    expect(text(wrapper)).toContain('to read and add comments.')
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(axios.get).not.toHaveBeenCalled()
  })
  it('R02 displays the author and the existing comment', async () => {
    axios.get.mockResolvedValue({ data: [comment] })
    const { wrapper } = await renderComments()
    await flushPromises()
    expect(text(wrapper)).toContain('Alex')
    expect(text(wrapper)).toContain(comment.content)
  })
  it('R03 posts trimmed text, displays the returned comment and clears the form', async () => {
    axios.post.mockResolvedValue({ data: { ...comment, content: 'Great recipe' } })
    const { wrapper } = await renderComments()
    await flushPromises()
    await wrapper.get('#recipe-comment').setValue('  Great recipe  ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(axios.post).toHaveBeenCalledWith(`/activity/recipes/${recipe._id}/comments`,
      { content: 'Great recipe' }, { headers: { Authorization: 'Bearer token-a' } })
    expect(text(wrapper)).toContain('Great recipe')
    expect(text(wrapper)).toContain('Comment added!')
    expect(wrapper.get('#recipe-comment').element.value).toBe('')
  })
  it('R04 disables posting whitespace-only text', async () => {
    const { wrapper } = await renderComments()
    await flushPromises()
    await wrapper.get('textarea').setValue('   ')
    expect(button(wrapper, 'Post Comment').attributes('disabled')).toBeDefined()
    await wrapper.get('form').trigger('submit')
    expect(axios.post).not.toHaveBeenCalled()
  })
  it('R05 preserves the draft and displays an error after a failed post', async () => {
    axios.post.mockRejectedValue(serverError('Cannot add comment'))
    const { wrapper } = await renderComments()
    await flushPromises()
    await wrapper.get('textarea').setValue('Keep my draft')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(text(wrapper)).toContain('Cannot add comment')
    expect(wrapper.get('textarea').element.value).toBe('Keep my draft')
  })
  it('R06 prevents duplicate submissions while posting', async () => {
    const pending = deferred()
    axios.post.mockReturnValue(pending.promise)
    const { wrapper } = await renderComments()
    await flushPromises()
    await wrapper.get('textarea').setValue('One comment only')
    await wrapper.get('form').trigger('submit')
    expect(button(wrapper, 'Posting...').attributes('disabled')).toBeDefined()
    await wrapper.get('form').trigger('submit')
    expect(axios.post).toHaveBeenCalledTimes(1)
    pending.resolve({ data: { ...comment, content: 'One comment only' } })
    await flushPromises()
    expect(wrapper.findAll('article')).toHaveLength(1)
  })
  it('R07 hides edit and delete controls for another user’s comment', async () => {
    axios.get.mockResolvedValue({ data: [{ ...comment, userId: { _id: 'other', name: 'Other user' } }] })
    const { wrapper } = await renderComments()
    await flushPromises()
    expect(text(wrapper)).toContain('Other user')
    expect(wrapper.findAll('button').some(b => ['Edit', 'Delete'].includes(b.text()))).toBe(false)
  })
  it('R08 loads comments again when the recipe prop changes', async () => {
    axios.get.mockResolvedValueOnce({ data: [comment] }).mockResolvedValue({ data: [] })
    const { wrapper } = await renderComments()
    await flushPromises()
    await wrapper.setProps({ recipeId: '670000000000000000000102' })
    await flushPromises()
    expect(text(wrapper)).not.toContain(comment.content)
    expect(text(wrapper)).toContain('No comments yet.')
    expect(axios.get).toHaveBeenLastCalledWith('/activity/recipes/670000000000000000000102/comments',
      { headers: { Authorization: 'Bearer token-a' } })
  })
  it('R09 disables posting after a load error and recovers on retry', async () => {
    axios.get.mockRejectedValueOnce(serverError('Cannot load comments'))
    const { wrapper } = await renderComments()
    await flushPromises()
    await wrapper.get('textarea').setValue('My tip')
    expect(button(wrapper, 'Post Comment').attributes('disabled')).toBeDefined()
    await button(wrapper, 'Try again').trigger('click')
    await flushPromises()
    expect(button(wrapper, 'Post Comment').attributes('disabled')).toBeUndefined()
  })
})
