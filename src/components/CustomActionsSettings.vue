<script setup lang="ts">
// Custom Actions editor (CONTEXT.md: "自定义动作"). Under the immediate-apply
// model (ADR-0017) it mutates the settings store directly — every add / edit /
// remove persists straight to localStorage via the store's actions, so there
// is no draft and no outer "保存" button. Inserts template variables
// ({{context}} / {{selection}} / {{title}} / {{block}}) the rest of the app
// supports but the old UI never exposed.

import { ref, nextTick } from 'vue'
import { useSettingsStore } from '../stores/settings'
import type { Action } from '../lib/actions'

const settings = useSettingsStore()

/** Template variables the prompt renderer understands (lib/actions.ts). */
const VARIABLES = [
  { token: 'context', label: '上下文' },
  { token: 'selection', label: '选中内容' },
  { token: 'title', label: '文档标题' },
  { token: 'block', label: '完整上下文块' },
]

const editingId = ref<string | null>(null)
const draftLabel = ref('')
const draftTemplate = ref('')
const confirmId = ref<string | null>(null)

const labelInput = ref<HTMLInputElement | null>(null)
const templateInput = ref<HTMLTextAreaElement | null>(null)

function resetForm() {
  editingId.value = null
  draftLabel.value = ''
  draftTemplate.value = ''
}

function startAdd() {
  resetForm()
  confirmId.value = null
  void nextTick().then(() => labelInput.value?.focus())
}

function editAction(action: Action) {
  editingId.value = action.id
  draftLabel.value = action.label
  draftTemplate.value = action.template
  confirmId.value = null
  void nextTick().then(() => templateInput.value?.focus())
}

function save() {
  const label = draftLabel.value.trim()
  if (!label) return
  if (editingId.value) {
    settings.updateCustomAction(editingId.value, {
      label,
      template: draftTemplate.value,
    })
  } else {
    settings.addCustomAction(label, draftTemplate.value)
  }
  resetForm()
}

function askRemove(id: string) {
  confirmId.value = id
}

function confirmRemove() {
  if (confirmId.value) {
    if (editingId.value === confirmId.value) resetForm()
    settings.removeCustomAction(confirmId.value)
  }
  confirmId.value = null
}

function cancelRemove() {
  confirmId.value = null
}

/** Insert `{{token}}` at the caret position of the template textarea. */
function insertVar(token: string) {
  const el = templateInput.value
  const snippet = `{{${token}}}`
  if (!el) {
    draftTemplate.value += snippet
    return
  }
  const start = el.selectionStart
  const end = el.selectionEnd
  draftTemplate.value =
    draftTemplate.value.slice(0, start) + snippet + draftTemplate.value.slice(end)
  void nextTick().then(() => {
    el.focus()
    const caret = start + snippet.length
    el.setSelectionRange(caret, caret)
  })
}
</script>

<template>
  <div class="custom-actions">
    <ul v-if="settings.customActions.length" class="custom-list">
      <li
        v-for="action in settings.customActions"
        :key="action.id"
        class="custom-item"
        :class="{ editing: action.id === editingId }"
      >
        <div class="custom-info">
          <span class="custom-label">{{ action.label }}</span>
          <code class="custom-template">{{ action.template }}</code>
        </div>
        <div v-if="confirmId === action.id" class="custom-confirm">
          <span class="custom-confirm-text">确认删除？</span>
          <button class="link-button danger" type="button" @click="confirmRemove">
            删除
          </button>
          <button class="link-button" type="button" @click="cancelRemove">
            取消
          </button>
        </div>
        <div v-else class="custom-actions-row">
          <button
            class="link-button"
            type="button"
            @click="editAction(action)"
          >
            编辑
          </button>
          <button
            class="link-button danger"
            type="button"
            @click="askRemove(action.id)"
          >
            删除
          </button>
        </div>
      </li>
    </ul>

    <p v-else class="custom-empty">还没有自定义动作，在下面添加一个吧。</p>

    <div class="custom-form">
      <input
        ref="labelInput"
        v-model="draftLabel"
        class="custom-input"
        type="text"
        placeholder="动作名称，如「像给小孩解释」"
        @keydown.enter.prevent="templateInput?.focus()"
      />
      <textarea
        ref="templateInput"
        v-model="draftTemplate"
        class="custom-textarea"
        rows="3"
        placeholder="提示词模板，可插入下方变量占位符"
      />
      <div class="var-chips">
        <button
          v-for="v in VARIABLES"
          :key="v.token"
          class="var-chip"
          type="button"
          :title="`插入 {{${v.token}}}`"
          @click="insertVar(v.token)"
        >
          {{ v.label }}
        </button>
      </div>
      <div class="custom-form-actions">
        <button
          v-if="editingId"
          class="link-button"
          type="button"
          @click="resetForm"
        >
          取消
        </button>
        <button
          class="btn-primary sm"
          type="button"
          :disabled="!draftLabel.trim()"
          @click="save"
        >
          {{ editingId ? '保存' : '添加动作' }}
        </button>
      </div>
    </div>

    <button
      v-if="!editingId && settings.customActions.length"
      class="link-button add-another"
      type="button"
      @click="startAdd"
    >
      + 添加动作
    </button>
  </div>
</template>

<style scoped>
.custom-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.custom-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--surface);
  transition: border-color 0.15s ease, background 0.15s ease;
}
.custom-item.editing {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 6%, var(--surface));
}
.custom-info {
  min-width: 0;
}
.custom-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}
.custom-template {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.custom-actions-row {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}
.custom-confirm {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.custom-confirm-text {
  font-size: 13px;
  color: var(--text-muted);
}
.custom-empty {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text-muted);
}
.custom-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--surface-2);
  border-radius: 10px;
  padding: 12px;
}
.custom-input,
.custom-textarea {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
  width: 100%;
  background: var(--surface);
  color: var(--text);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.custom-input:focus,
.custom-textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent);
}
.var-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.var-chip {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.var-chip:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.custom-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  align-items: center;
}
.add-another {
  margin-top: 4px;
}
</style>
