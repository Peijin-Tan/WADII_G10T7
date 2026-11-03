<!--
  ConfirmDialog.vue
  The themed "Are you sure?" popup. Mounted ONCE in App.vue; pages open it with
  useConfirm() (composables/useConfirm.js) instead of window.confirm().
  Esc or clicking outside = Cancel. Focus starts on Cancel, so pressing Enter by
  accident never deletes anything.
-->
<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { confirmState, answerConfirm } from '@/composables/useConfirm'

const cancelBtn = ref(null)
let lastFocused = null

function onKey(e) {
  if (e.key === 'Escape') answerConfirm(false)
}

watch(
  () => confirmState.open,
  async (open) => {
    if (open) {
      lastFocused = document.activeElement
      window.addEventListener('keydown', onKey)
      await nextTick()
      cancelBtn.value?.focus()
    } else {
      window.removeEventListener('keydown', onKey)
      lastFocused?.focus?.() // back to the button that opened it
    }
  },
)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="cd">
      <div v-if="confirmState.open" class="cd-backdrop" @click.self="answerConfirm(false)">
        <div class="cd-card" :class="`cd-card--${confirmState.tone}`" role="alertdialog" aria-modal="true"
          aria-labelledby="cd-title" aria-describedby="cd-message">
          <span class="cd-icon" aria-hidden="true">
            <span class="material-symbols-outlined">
              {{ confirmState.icon || (confirmState.tone === 'danger' ? 'delete' : 'help') }}
            </span>
          </span>
          <h2 id="cd-title" class="cd-title">{{ confirmState.title }}</h2>
          <p v-if="confirmState.message" id="cd-message" class="cd-message">{{ confirmState.message }}</p>
          <div class="cd-actions">
            <button ref="cancelBtn" type="button" class="cd-btn cd-btn--cancel" @click="answerConfirm(false)">
              {{ confirmState.cancelText }}
            </button>
            <button type="button" class="cd-btn cd-btn--confirm" @click="answerConfirm(true)">
              {{ confirmState.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cd-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(26, 28, 24, 0.45);
  backdrop-filter: blur(3px);
}

.cd-card {
  --tone: #a23e18;
  --tone-hover: #85310f;
  --tone-chip: #ffdbcf;

  width: 100%;
  max-width: 400px;
  padding: 24px;
  border-radius: 16px;
  background: #fafaf3;
  color: #1a1c18;
  box-shadow: 0 20px 50px rgba(26, 28, 24, 0.25);
  text-align: center;
}

.cd-card--primary { --tone: #32533c; --tone-hover: #4a6b53; --tone-chip: #c7ecce; }

.cd-icon {
  width: 52px;
  height: 52px;
  margin: 0 auto 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--tone-chip);
  color: var(--tone);
}

.cd-icon .material-symbols-outlined { font-size: 26px; }

.cd-title {
  margin: 0 0 6px;
  font: 600 20px/28px 'Outfit', sans-serif;
}

.cd-message {
  margin: 0 auto;
  max-width: 32ch;
  font: 400 14px/21px 'Inter', sans-serif;
  color: #424842;
}

.cd-actions {
  display: flex;
  gap: 8px;
  margin-top: 20px;
}

.cd-btn {
  flex: 1;
  padding: 10px 16px;
  border: 0;
  border-radius: 10px;
  font: 600 13px/18px 'Inter', sans-serif;
  letter-spacing: 0.01em;
  transition: background-color 0.15s;
}

.cd-btn:focus-visible { outline: 2px solid var(--tone); outline-offset: 2px; }
.cd-btn--cancel { background: #e8e9e2; color: #1a1c18; }
.cd-btn--cancel:hover { background: #e3e3dc; }
.cd-btn--confirm { background: var(--tone); color: #fff; }
.cd-btn--confirm:hover { background: var(--tone-hover); }

/* opens with a small lift so it's clear what appeared */
.cd-enter-active { transition: opacity var(--dur-modal) var(--ease-out); }
.cd-leave-active { transition: opacity var(--dur-exit) var(--ease-out); }
.cd-enter-active .cd-card { transition: transform var(--dur-modal) var(--ease-out); }
.cd-leave-active .cd-card { transition: transform var(--dur-exit) var(--ease-out); }
.cd-enter-from, .cd-leave-to { opacity: 0; }
.cd-enter-from .cd-card, .cd-leave-to .cd-card { transform: translateY(8px) scale(0.98); }

@media (prefers-reduced-motion: reduce) {
  .cd-enter-active, .cd-leave-active, .cd-enter-active .cd-card, .cd-leave-active .cd-card { transition: none; }
}
</style>
