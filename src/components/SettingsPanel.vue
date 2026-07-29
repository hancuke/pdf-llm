<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import type { Action } from '../lib/actions'

const settings = useSettingsStore()
const ui = useUiStore()

const endpoint = computed({
  get: () => settings.endpoint,
  set: (v: string) => settings.updateEndpoint(v),
})
const apiKey = computed({
  get: () => settings.apiKey,
  set: (v: string) => settings.updateApiKey(v),
})
const model = computed({
  get: () => settings.model,
  set: (v: string) => settings.updateModel(v),
})

// Custom Action editor state.
const editingId = ref<string | null>(null)
const draftLabel = ref('')
const draftTemplate = ref('')

const customActions = computed(() => settings.customActions)

function resetForm() {
  editingId.value = null
  draftLabel.value = ''
  draftTemplate.value = ''
}

function saveCustomAction() {
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

function editCustomAction(action: Action) {
  editingId.value = action.id
  draftLabel.value = action.label
  draftTemplate.value = action.template
}

function removeCustomAction(id: string) {
  if (editingId.value === id) resetForm()
  settings.removeCustomAction(id)
}
</script>

<template>
  <div class="settings-overlay" @click.self="ui.closeSettings()">
    <div class="settings-panel" role="dialog" aria-modal="true">
      <header class="settings-header">
        <h2>设置</h2>
        <button class="icon-button" type="button" @click="ui.closeSettings()">
          ✕
        </button>
      </header>

      <div class="settings-body">
        <p class="settings-note">
          你的密钥仅保存在本机浏览器（localStorage），由你直连 LLM，不上传到任何自有服务器。
          若端点不支持 CORS，调用会失败——请使用本地或支持 CORS 的端点。
        </p>

        <label class="field">
          <span>端点 Base URL</span>
          <input
            v-model="endpoint"
            type="text"
            placeholder="https://api.openai.com/v1 或 http://localhost:11434/v1"
          />
        </label>

        <label class="field">
          <span>API 密钥</span>
          <input v-model="apiKey" type="password" placeholder="sk-..." />
        </label>

        <label class="field">
          <span>模型</span>
          <input
            v-model="model"
            type="text"
            placeholder="gpt-4o-mini / llama3 / ..."
          />
        </label>

        <hr class="divider" />

        <h3 class="section-title">自定义动作</h3>
        <ul class="custom-list">
          <li v-for="action in customActions" :key="action.id" class="custom-item">
            <div class="custom-info">
              <span class="custom-label">{{ action.label }}</span>
              <code class="custom-template">{{ action.template }}</code>
            </div>
            <div class="custom-actions">
              <button class="link-button" type="button" @click="editCustomAction(action)">
                编辑
              </button>
              <button class="link-button danger" type="button" @click="removeCustomAction(action.id)">
                删除
              </button>
            </div>
          </li>
          <li v-if="customActions.length === 0" class="custom-empty">
            还没有自定义动作。
          </li>
        </ul>

        <div class="custom-form">
          <input
            v-model="draftLabel"
            class="custom-input"
            type="text"
            placeholder="动作名称，如「像给小孩解释」"
          />
          <textarea
            v-model="draftTemplate"
            class="custom-textarea"
            rows="3"
            placeholder="提示词模板，可用 {{context}} 与 {{selection}} 占位符"
          ></textarea>
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
              class="send-button"
              type="button"
              :disabled="!draftLabel.trim()"
              @click="saveCustomAction"
            >
              {{ editingId ? '保存' : '添加' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
