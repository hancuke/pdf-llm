<script setup lang="ts" generic="T extends string">
// Reusable iOS-style segmented control. Built on native radio inputs so it
// inherits free keyboard (arrow-key) support and screen-reader semantics; the
// radios are visually hidden and the labels are styled as segments. Used for
// the appearance theme and the explanation style in Settings. Generic over the
// option value type so callers keep their domain union (Theme / ExplanationStyle).

interface Option {
  value: T
  label: string
}

defineProps<{
  modelValue: T
  options: Option[]
  ariaLabel: string
}>()

const emit = defineEmits<{ (e: 'update:modelValue', value: T): void }>()
</script>

<template>
  <div class="segmented" role="radiogroup" :aria-label="ariaLabel">
    <label
      v-for="opt in options"
      :key="opt.value"
      class="segment"
      :class="{ active: modelValue === opt.value }"
    >
      <input
        class="segment-input"
        type="radio"
        name="segmented"
        :value="opt.value"
        :checked="modelValue === opt.value"
        @change="emit('update:modelValue', opt.value)"
      />
      <span class="segment-label">{{ opt.label }}</span>
    </label>
  </div>
</template>

<style scoped>
.segmented {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--surface-2);
  border-radius: 10px;
}
.segment {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}
.segment:hover {
  color: var(--text);
}
.segment.active {
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 1px 3px var(--shadow);
}
/* Visually hide the radio but keep it focusable for keyboard users. */
.segment-input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  margin: 0;
  pointer-events: none;
}
.segment:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.segment-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
