// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },

  modules: [
    "@nuxt/ui",
    "@nuxt/image",
    "@pinia/nuxt",
    "@vueuse/nuxt",
    "@nuxt/icon",
    "@nuxt/eslint",
  ],

  icon: {
    clientBundle: {
      scan: true,
      sizeLimitKb: 256,
    },
  }
})