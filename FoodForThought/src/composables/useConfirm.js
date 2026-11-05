import { reactive } from 'vue'

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

export function answerConfirm(answer) {
  const resolve = confirmState.resolve
  confirmState.open = false
  confirmState.resolve = null
  if (resolve) resolve(answer)
}
