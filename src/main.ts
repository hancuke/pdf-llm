import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import 'katex/dist/katex.min.css'
import './style.css'

createApp(App).use(createPinia()).mount('#app')
