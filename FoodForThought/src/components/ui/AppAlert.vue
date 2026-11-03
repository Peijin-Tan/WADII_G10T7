<!--
  AppAlert.vue
  Themed message banner used instead of Bootstrap's default .alert boxes.

  Usage:
    <AppAlert v-if="errorMsg" tone="error" title="Couldn't save that change" @dismiss="errorMsg = ''">
      {{ errorMsg }}
    </AppAlert>

  tone:  success | error | warning | info   (sets the colour and the icon)
  title: optional bold first line; the slot is the explanation underneath
  dismissible: shows the close button (default true), which emits "dismiss"
-->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  tone: { type: String, default: 'info', validator: (t) => ['success', 'error', 'warning', 'info'].includes(t) },
  title: { type: String, default: '' },
  icon: { type: String, default: '' }, // Material Symbols name, to override the tone's default icon
  dismissible: { type: Boolean, default: true },
})
defineEmits(['dismiss'])

const ICONS = { success: 'check_circle', error: 'error', warning: 'warning', info: 'lightbulb' }
const iconName = computed(() => props.icon || ICONS[props.tone])
// errors interrupt screen readers straight away; the rest are announced politely
const role = computed(() => (props.tone === 'error' ? 'alert' : 'status'))
</script>

<template>
  <div class="app-alert" :class="`app-alert--${tone}`" :role="role">
    <span class="app-alert-icon" aria-hidden="true">
      <span class="material-symbols-outlined">{{ iconName }}</span>
    </span>
    <div class="app-alert-text">
      <p v-if="title" class="app-alert-title">{{ title }}</p>
      <div class="app-alert-body"><slot /></div>
    </div>
    <button v-if="dismissible" type="button" class="app-alert-close" aria-label="Dismiss message" @click="$emit('dismiss')">
      <span class="material-symbols-outlined">close</span>
    </button>
  </div>
</template>

<style scoped>
.app-alert {
  /* each tone sets these four */
  --tone-bg: #eaf1f5;
  --tone-bar: #2f5d73;
  --tone-chip: #cfe3ec;
  --tone-text: #0e2a36;

  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px 12px 12px 16px;
  border: 1px solid color-mix(in srgb, var(--tone-bar) 22%, transparent);
  border-left: 4px solid var(--tone-bar);
  border-radius: 12px;
  background: var(--tone-bg);
  color: var(--tone-text);
  animation: app-alert-in 0.22s ease-out;
}

.app-alert--success { --tone-bg: #eaf5ec; --tone-bar: #32533c; --tone-chip: #c7ecce; --tone-text: #01210f; }
.app-alert--error   { --tone-bg: #fdeee8; --tone-bar: #a23e18; --tone-chip: #ffdbcf; --tone-text: #390c00; }
.app-alert--warning { --tone-bg: #fff4e3; --tone-bar: #b7791f; --tone-chip: #ffddb5; --tone-text: #2a1800; }
.app-alert--info    { --tone-bg: #eaf1f5; --tone-bar: #2f5d73; --tone-chip: #cfe3ec; --tone-text: #0e2a36; }

.app-alert-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--tone-chip);
  color: var(--tone-bar);
}

.app-alert-icon .material-symbols-outlined {
  font-size: 18px;
  font-variation-settings: 'FILL' 1;
}

.app-alert-text {
  flex: 1;
  min-width: 0;
  padding-top: 5px;
}

.app-alert-title {
  margin: 0 0 2px;
  font: 600 15px/20px 'Outfit', sans-serif;
}

.app-alert-body {
  font: 400 13.5px/20px 'Inter', sans-serif;
  overflow-wrap: anywhere;
}

.app-alert-body :deep(strong) { font-weight: 600; }

.app-alert-close {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  opacity: 0.65;
  transition: opacity 0.15s, background-color 0.15s;
}

.app-alert-close:hover { opacity: 1; background: color-mix(in srgb, var(--tone-bar) 10%, transparent); }
.app-alert-close:focus-visible { outline: 2px solid var(--tone-bar); outline-offset: 1px; opacity: 1; }
.app-alert-close .material-symbols-outlined { font-size: 18px; }

@keyframes app-alert-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .app-alert { animation: none; }
}
</style>
