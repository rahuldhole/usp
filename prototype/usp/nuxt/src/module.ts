import { defineNuxtModule, createResolver, addServerHandler, addImports, addServerPlugin } from '@nuxt/kit'

export default defineNuxtModule({
  meta: {
    name: 'nuxt-usp',
    configKey: 'usp'
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    // Pass options to runtime config so server plugin can read it
    nuxt.options.runtimeConfig.usp = options as any

    // Add API routes
    addServerHandler({
      route: '/api/usp/subscribe',
      handler: resolver.resolve('./runtime/server/api/subscribe.get')
    })

    addServerHandler({
      route: '/api/usp/sync',
      handler: resolver.resolve('./runtime/server/api/sync.post')
    })

    // Add Server Plugin (initializes USPServer with the right adapter)
    addServerPlugin(resolver.resolve('./runtime/plugin.server'))

    // Auto-import useUsp and USP for the frontend
    addImports([
      {
        name: 'useUsp',
        as: 'useUsp',
        from: 'usp-js/client'
      },
      {
        name: 'USP',
        as: 'USP',
        from: 'usp-js/client'
      }
    ])
  }
})
