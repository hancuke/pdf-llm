<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useConversationStore } from '../stores/conversation'
import { useReaderStore } from '../stores/reader'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'

const conversation = useConversationStore()
const reader = useReaderStore()
const settings = useSettingsStore()
const ui = useUiStore()

const { active, messages, loading, error } = storeToRefs(conversation)
const { currentSelection } = storeToRefs(reader)

const draft = ref('')

function send() {
  const text = draft.value.trim()
  if (!text || conversation.loading) return
  draft.value = ''
  void conversation.followUp(text)
}

function clearConversation() {
  conversation.clear()
  draft.value = ''
}
</script>

<template>
  <section class="conversation">
    <header class="conv-header">
      <span class="conv-title">对话</span>
      <button
        v-if="active"
        class="link-button"
        type="button"
        @click="clearConversation"
      >
        清空
      </button>
    </header>

    <div v-if="!active" class="conv-idle">
      <p v-if="!settings.isConfigured" class="conv-warn">
        尚未配置 LLM 端点或密钥，
        <button class="link-button" type="button" @click="ui.openSettings">
          前往设置
        </button>
      </p>
      <p v-else>在 PDF 中选中文字，选择一个操作即可开始对话。</p>
    </div>

    <template v-else>
      <div v-if="error" class="conv-error">{{ error }}</div>

      <div class="conv-messages">
        <div
          v-for="(m, i) in messages"
          :key="i"
          :class="['msg', m.role]"
        >
          <div v-if="m.role === 'assistant'" class="msg-content">
            {{ m.content }}
          </div>
          <div v-else-if="i === 0 && currentSelection" class="msg-first">
            <span class="msg-label">选中内容</span>
            {{ currentSelection.selectedText }}
          </div>
          <div v-else class="msg-content">{{ m.content }}</div>
        </div>
        <div v-if="loading" class="conv-loading">生成中…</div>
      </div>

      <form class="conv-composer" @submit.prevent="send">
        <textarea
          v-model="draft"
          class="conv-input"
          rows="2"
          placeholder="继续追问…（回车发送，Shift+Enter 换行）"
          :disabled="loading"
          @keydown.enter.exact.prevent="send"
        ></textarea>
        <button class="send-button" type="submit" :disabled="loading || !draft.trim()">
          发送
        </button>
      </form>
    </template>
  </section>
</template>
