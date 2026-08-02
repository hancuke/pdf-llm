<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useConversationStore } from '../stores/conversation'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import { downloadConversationMarkdown } from '../lib/exportConversation'
import { renderMarkdown } from '../lib/markdown'

const conversation = useConversationStore()
const settings = useSettingsStore()
const ui = useUiStore()

const { active, messages, displayMessages, loading, error, clearRequested } =
  storeToRefs(conversation)

const draft = ref('')

function send() {
  const text = draft.value.trim()
  if (!text || conversation.loading) return
  draft.value = ''
  void conversation.followUp(text)
}

function requestClearConversation() {
  conversation.requestClear()
}
function confirmClearConversation() {
  conversation.confirmClear()
  draft.value = ''
}
function cancelClearConversation() {
  conversation.cancelClear()
}

function exportConversation() {
  downloadConversationMarkdown()
}
</script>

<template>
  <section class="conversation">
    <header class="conv-header">
      <span class="conv-title">对话</span>
      <div class="conv-header-actions">
        <button
          v-if="active"
          class="link-button"
          type="button"
          @click="exportConversation"
        >
          导出
        </button>
        <button
          v-if="active && !clearRequested"
          class="link-button danger"
          type="button"
          @click="requestClearConversation"
        >
          清空
        </button>
        <template v-if="active && clearRequested">
          <span class="conv-confirm-text">确认清空？</span>
          <button
            class="link-button danger"
            type="button"
            @click="confirmClearConversation"
          >
            清空
          </button>
          <button class="link-button" type="button" @click="cancelClearConversation">
            取消
          </button>
        </template>
      </div>
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

      <div v-if="messages.length === 0 && !loading" class="conv-idle">
        <p>对话已开始。继续选中文字并选择操作，或直接在下方追问。</p>
      </div>

      <div class="conv-messages">
        <div
          v-for="(m, i) in displayMessages"
          :key="i"
          :class="['msg', m.role]"
        >
          <span class="msg-role">{{ m.role === 'assistant' ? '助手' : '你' }}</span>
          <div
            v-if="m.role === 'assistant'"
            class="msg-content"
            v-html="renderMarkdown(m.content)"
          ></div>
          <div v-else class="msg-content msg-raw">{{ m.content }}</div>
        </div>
        <div v-if="loading" class="conv-loading-row">
          <span class="conv-loading">生成中…</span>
          <button class="link-button" type="button" @click="conversation.stop()">
            停止
          </button>
        </div>
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
        <button
          v-if="loading"
          class="send-button"
          type="button"
          @click="conversation.stop()"
        >
          停止
        </button>
        <button v-else class="send-button" type="submit" :disabled="!draft.trim()">
          发送
        </button>
      </form>
    </template>
  </section>
</template>
