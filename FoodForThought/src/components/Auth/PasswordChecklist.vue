<script setup>
/* Live list of the password rules under a "new password" box (Register, Change Password).
   Each rule turns green with a tick once the typed password meets it.
   Rules: src/utils/passwordRules.js */
import { computed } from 'vue'
import { checkPassword, MAX_PASSWORD_LENGTH } from '@/utils/passwordRules'

const props = defineProps({
  password: { type: String, default: '' },
  id: { type: String, default: undefined }, // for aria-describedby on the input
})

const rules = computed(() => checkPassword(props.password))
const metCount = computed(() => rules.value.filter((r) => r.met).length)
const tooLong = computed(() => new TextEncoder().encode(props.password).length > MAX_PASSWORD_LENGTH)
</script>

<template>
  <div :id="id" class="pw-check">
    <p class="pw-check-title">
      Your password needs
      <span class="pw-check-count">{{ metCount }}/{{ rules.length }}</span>
    </p>
    <ul class="pw-check-list">
      <li v-for="rule in rules" :key="rule.id" :class="{ 'is-met': rule.met }">
        <span class="material-symbols-outlined" aria-hidden="true">{{ rule.met ? 'check_circle' : 'radio_button_unchecked' }}</span>
        {{ rule.label }}
        <span class="visually-hidden">{{ rule.met ? '(done)' : '(missing)' }}</span>
      </li>
    </ul>
    <p v-if="tooLong" class="pw-check-error" role="alert">
      <span class="material-symbols-outlined" aria-hidden="true">error</span>
      Too long: use at most {{ MAX_PASSWORD_LENGTH }} characters.
    </p>
  </div>
</template>

<style scoped>
.pw-check {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f4f5ef;
  font-size: 13px;
  line-height: 18px;
  color: #5d6259;
}
.pw-check-title {
  display: flex;
  justify-content: space-between;
  margin: 0 0 6px;
  font-weight: 600;
  color: #2a2d27;
}
.pw-check-count {
  font-weight: 500;
  color: #5d6259;
  font-variant-numeric: tabular-nums;
}
.pw-check-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.pw-check-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  transition: color 0.15s ease;
}
/* an odd last rule gets the full row instead of wrapping in half a column */
.pw-check-list li:last-child:nth-child(odd) {
  grid-column: 1 / -1;
}
.pw-check-list li.is-met {
  color: #32533c;
}
.pw-check-list .material-symbols-outlined {
  flex: none;
  font-size: 16px;
}
.pw-check-error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0 0;
  color: #b3261e;
}
.pw-check-error .material-symbols-outlined {
  font-size: 16px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
@media (max-width: 420px) {
  .pw-check-list {
    grid-template-columns: 1fr;
  }
}
</style>
