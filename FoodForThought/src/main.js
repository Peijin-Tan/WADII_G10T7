import './assets/main.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap'
import './assets/theme.css'
import './assets/forms.css'
import './assets/motion.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { vRecipeImg } from './directives/recipeImage'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.directive('recipe-img', vRecipeImg)

app.mount('#app')
