import { createSSRApp } from 'vue'
import App from './App.vue'
import { prototypeInterceptor, requestInterceptor, routeInterceptor } from './interceptors'

import store from './store'
import '@/style/index.scss'
import 'virtual:uno.css'

export function createApp() {
  const app = createSSRApp(App)
  app.use(store)
  app.use(routeInterceptor)
  app.use(requestInterceptor)
  app.use(prototypeInterceptor)

  return {
    app,
  }
}
