// useConfirm.js
// A themed replacement for window.confirm(), which shows the browser's plain grey box.
// <ConfirmDialog /> is mounted once in App.vue and shows whatever is asked here.
//
//   import { useConfirm } from '@/composables/useConfirm'
//   const confirm = useConfirm()
//   const ok = await confirm({
//     title: 'Remove Garlic?',
//     message: 'It will be taken out of your pantry.',
//     confirmText: 'Remove',
//     tone: 'danger',        // 'danger' (red button) or 'primary' (green button)
//   })
//   if (!ok) return
import { reactive } from 'vue'

// One dialog for the whole app, so this state is shared (module level, not per component)
export const confirmState = reactive({
  open: false,
  title: '',
  message: '',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  tone: 'danger',
  icon: '',
  resolve: null,
})

export function useConfirm() {
  return (options = {}) =>
    new Promise((resolve) => {
      // a second confirm while one is open cancels the first
      if (confirmState.resolve) confirmState.resolve(false)
      Object.assign(confirmState, {
        title: 'Are you sure?',
        message: '',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        tone: 'danger',
        icon: '',
        ...options,
        open: true,
        resolve,
      })
    })
}

// Called by ConfirmDialog when the user picks a button (or presses Esc / clicks outside)
export function answerConfirm(answer) {
  const resolve = confirmState.resolve
  confirmState.open = false
  confirmState.resolve = null
  if (resolve) resolve(answer)
}
